import os
import re
import threading
import time
import xml.etree.ElementTree as ET
from collections import OrderedDict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import requests

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
DB_PATH = Path(__file__).resolve().parent / "database" / "emboss_e.dat"

# GRCh38 kromozom uzunlukları (baz çifti). Sadece insan genleri için kullanılır.
HUMAN_CHROMOSOME_LENGTHS = {
    "1": 248956422, "2": 242193529, "3": 198295559, "4": 190214555,
    "5": 181538259, "6": 170805979, "7": 159345973, "8": 145138636,
    "9": 138394717, "10": 133797422, "11": 135086622, "12": 133275309,
    "13": 114364328, "14": 107043718, "15": 101991189, "16": 90338345,
    "17": 83257441, "18": 80373285, "19": 58617616, "20": 64444167,
    "21": 46709983, "22": 50818468, "X": 156040895, "Y": 57227415,
    "MT": 16569,
}

# Laboratuvarlarda en sık kullanılan, kesim noktası bilinen enzimler.
COMMON_ENZYMES = [
    "EcoRI", "BamHI", "HindIII", "NotI", "XhoI", "PstI", "SalI", "SmaI",
    "KpnI", "SacI", "XbaI", "NcoI", "NdeI", "EcoRV", "SpeI", "BglII",
    "NheI", "ApaI", "MluI", "PvuII", "ScaI", "SphI",
]


class NCBIError(Exception):
    """NCBI'a ulaşılamadığında veya beklenmeyen bir cevap döndüğünde fırlatılır."""


# ---------------------------------------------------------------------------
# GenBank konum metni ayrıştırıcı
# ---------------------------------------------------------------------------

_RANGE_RE = re.compile(r"^(<?)(\d+)(?:(\.\.|\^)(>?)(\d+))?(>?)$")


def parse_location(location: str) -> dict:
    """
    GenBank konum metnini yapılandırılmış hale getirir.

    Örnekler:
        "1..500"                         -> strand +1, [(1, 500)]
        "join(1..120,4500..4700)"        -> strand +1, [(1, 120), (4500, 4700)]
        "complement(join(5..9,20..30))"  -> strand -1, [(5, 9), (20, 30)]
        "<1..>300"                       -> uçları eksik (partial) bölge

    Dönüş:
        {"strand": 1 | -1, "segments": [(start, end), ...],
         "partial_start": bool, "partial_end": bool}
    Segmentler her zaman artan koordinat sırasında döner (1 tabanlı, uçlar dahil).
    Başka bir kayda referans veren parçalar (ör. "NC_000016.10:1..5") atlanır.
    """
    text = (location or "").replace(" ", "")
    strand = 1
    while text.startswith("complement(") and text.endswith(")"):
        strand *= -1
        text = text[len("complement("):-1]

    segments: List[Tuple[int, int]] = []
    partial_start = partial_end = False

    for raw in _split_top_level(_strip_wrappers(text)):
        inner_strand = 1
        piece = raw
        while piece.startswith("complement(") and piece.endswith(")"):
            inner_strand *= -1
            piece = piece[len("complement("):-1]
        if "(" in piece:
            nested = parse_location(piece)
            segments.extend(nested["segments"])
            partial_start |= nested["partial_start"]
            partial_end |= nested["partial_end"]
            continue
        if ":" in piece:
            continue
        m = _RANGE_RE.match(piece)
        if not m:
            continue
        lt, a, sep, gt_mid, b, gt_end = m.groups()
        start = int(a)
        end = int(b) if b else start
        if sep == "^":
            end = start  # iki baz arasındaki nokta; tek baz gibi ele alınır
        if inner_strand == -1 and strand == 1:
            strand = -1
        partial_start |= bool(lt)
        partial_end |= bool(gt_mid or gt_end)
        segments.append((min(start, end), max(start, end)))

    segments.sort()
    return {
        "strand": strand,
        "segments": segments,
        "partial_start": partial_start,
        "partial_end": partial_end,
    }


def _strip_wrappers(text: str) -> str:
    for wrapper in ("join(", "order("):
        if text.startswith(wrapper) and text.endswith(")"):
            return text[len(wrapper):-1]
    return text


def _split_top_level(text: str) -> List[str]:
    parts, depth, current = [], 0, []
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(current))
            current = []
        else:
            current.append(ch)
    if current:
        parts.append("".join(current))
    return [p for p in parts if p]


def flip_segments(segments: List[Tuple[int, int]], length: int) -> List[Tuple[int, int]]:
    """Ters iplikteki bir gen için koordinatları genin kendi okuma yönüne (5'→3') çevirir."""
    flipped = [(length - end + 1, length - start + 1) for start, end in segments]
    return sorted(flipped)


# ---------------------------------------------------------------------------
# Ana sınıf
# ---------------------------------------------------------------------------

class ReFind:
    # IUPAC belirsizlik kodları
    IUPAC = {
        'A': 'A', 'C': 'C', 'G': 'G', 'T': 'T', 'U': 'T',
        'R': '[AG]', 'Y': '[CT]', 'S': '[GC]', 'W': '[AT]', 'K': '[GT]', 'M': '[AC]',
        'B': '[CGT]', 'D': '[AGT]', 'H': '[ACT]', 'V': '[ACG]', 'N': '[ACGT]'
    }
    IUPAC.update({k.lower(): v for k, v in IUPAC.items()})

    _lock = threading.Lock()
    _last_request = 0.0

    def __init__(self, emboss_path: Optional[str] = None, cache_size: int = 256):
        self.enzymes = self._load_emboss_enzymes(emboss_path or DB_PATH)
        self.api_key = os.environ.get("NCBI_API_KEY", "").strip()
        self.email = os.environ.get("NCBI_EMAIL", "").strip()
        # API anahtarı yoksa NCBI saniyede 3, varsa 10 isteğe izin verir.
        self.min_interval = 0.11 if self.api_key else 0.34
        self.session = requests.Session()
        self._cache: "OrderedDict[tuple, str]" = OrderedDict()
        self._cache_size = cache_size

    # ------------------------------------------------------------------ HTTP

    def _get(self, endpoint: str, params: dict, timeout: int = 15) -> str:
        """
        NCBI'a GET isteği atar. Aynı istek daha önce yapıldıysa önbellekten döner,
        istekler arasında NCBI hız sınırına uyacak kadar bekler, 429 gelirse bir kez yeniden dener.
        """
        params = dict(params)
        params["tool"] = "ReFinder"
        if self.email:
            params["email"] = self.email
        if self.api_key:
            params["api_key"] = self.api_key

        key = (endpoint, tuple(sorted((k, str(v)) for k, v in params.items() if k != "api_key")))
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]

        url = f"{EUTILS}/{endpoint}"
        for attempt in range(2):
            with ReFind._lock:
                wait = self.min_interval - (time.monotonic() - ReFind._last_request)
                if wait > 0:
                    time.sleep(wait)
                ReFind._last_request = time.monotonic()
            try:
                r = self.session.get(url, params=params, timeout=timeout)
            except requests.RequestException as e:
                raise NCBIError(f"NCBI'a ulaşılamadı: {e}") from e
            if r.status_code == 429 and attempt == 0:
                time.sleep(1.0)
                continue
            if not r.ok:
                raise NCBIError(f"NCBI {r.status_code} döndürdü ({endpoint})")
            break

        self._cache[key] = r.text
        if len(self._cache) > self._cache_size:
            self._cache.popitem(last=False)
        return r.text

    # ------------------------------------------------------------ enzimler

    @classmethod
    def _pattern_to_regex(cls, pat: str) -> str:
        return ''.join(cls.IUPAC.get(ch, re.escape(ch)) for ch in pat)

    @staticmethod
    def _revcomp(seq: str) -> str:
        tbl = str.maketrans('ACGTacgtNnRYWSKMBDHVrywskmbdhv',
                            'TGCAtgcaNnYRWSMKVHDByrwsmkvhdb')
        return seq.translate(tbl)[::-1]

    @staticmethod
    def _overhang_info(top: int, bottom: int) -> Tuple[str, int]:
        """Üst iplik kesimi alt iplikten önceyse 5' uç, sonraysa 3' uç açıkta kalır."""
        if top == bottom:
            return ('blunt', 0)
        if top < bottom:
            return ("5'-overhang", bottom - top)
        return ("3'-overhang", top - bottom)

    @staticmethod
    def _cut_offset(c: int) -> int:
        """
        EMBOSS numaralandırmasında 0 yoktur (... -2 -1 1 2 ...) ve kesim, verilen bazın sağındadır.
        Bu fonksiyon değeri motifin başlangıcına göre "kesimin solunda kalan baz sayısı"na çevirir.
        """
        return c if c > 0 else c + 1

    def _load_emboss_enzymes(self, path) -> Dict[str, dict]:
        enzymes = {}
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            for raw in f:
                if not raw.strip() or raw.startswith('#'):
                    continue
                parts = raw.rstrip('\n').split('\t')
                if len(parts) < 9:
                    continue
                name, pattern, length, ncuts, blunt, c1, c2, c3, c4 = parts[:9]
                enzymes[name] = {
                    'pattern': pattern,
                    'len': int(length),
                    'ncuts': int(ncuts),
                    'blunt': bool(int(blunt)),
                    'cuts': [int(c1), int(c2), int(c3), int(c4)],
                    # lookahead: örtüşen tanıma bölgelerini de yakalar (ör. GCGCGC içinde iki HhaI)
                    'regex': re.compile(f"(?=({self._pattern_to_regex(pattern)}))", re.IGNORECASE),
                }
        return enzymes

    def find_sites(self, sequence: str, enzyme_subset: Iterable[str] = None) -> List[dict]:
        """
        Dizide verilen enzimlerin kesim noktalarını bulur (iki iplik de taranır).

        Konumlar 0 tabanlı "sınır" olarak döner: cut_top = 5 ise üst iplik 5. bazdan sonra kesilir.
        Kesim noktası bilinmeyen (ncuts = 0) enzimler sonuç üretmez.
        """
        seq = sequence.upper()
        L = len(seq)
        rc = self._revcomp(seq)
        chosen = set(enzyme_subset) if enzyme_subset else None
        off = self._cut_offset

        events = {}

        def add(name, e, site_idx, start, top, bottom, strand):
            if not (0 <= top <= L and 0 <= bottom <= L):
                return
            key = (name, site_idx, top, bottom)
            if key in events:
                return  # palindromik motif iki iplikte de aynı yerde eşleşir
            otype, olen = self._overhang_info(top, bottom)
            events[key] = {
                'enzyme': name,
                'pattern': e['pattern'],
                'match_span': (start, start + e['len']),
                'strand': strand,
                'site_index': site_idx,
                'cut_top': top,
                'cut_bottom': bottom,
                'overhang': {'type': otype, 'length': olen},
                'blunt': otype == 'blunt',
            }

        for name, e in self.enzymes.items():
            if chosen is not None and name not in chosen:
                continue
            if e['ncuts'] < 2:
                continue
            c1, c2, c3, c4 = e['cuts']
            pairs = [(1, c1, c2)]
            if e['ncuts'] >= 4:
                pairs.append((2, c3, c4))
            patlen = e['len']

            for m in e['regex'].finditer(seq):
                s = m.start()
                for idx, ct, cb in pairs:
                    add(name, e, idx, s, s + off(ct), s + off(cb), 1)

            for m in e['regex'].finditer(rc):
                s_rc = m.start()
                start_fwd = L - (s_rc + patlen)
                for idx, ct, cb in pairs:
                    # Ters iplikteki "üst" kesim, düz iplikte alt ipliğe denk gelir.
                    bottom = L - (s_rc + off(ct))
                    top = L - (s_rc + off(cb))
                    add(name, e, idx, start_fwd, top, bottom, -1)

        results = list(events.values())
        results.sort(key=lambda x: (min(x['cut_top'], x['cut_bottom']), x['enzyme'], x['site_index']))
        return results

    def enzyme_list(self, only_with_cuts: bool = True) -> List[dict]:
        return [
            {'name': n, 'pattern': e['pattern'], 'length': e['len'], 'blunt': e['blunt']}
            for n, e in sorted(self.enzymes.items(), key=lambda kv: kv[0].lower())
            if not only_with_cuts or e['ncuts'] >= 2
        ]

    # ---------------------------------------------------------------- NCBI

    def fetch_gene_ids(self, symbol: str, organism: str = "", retmax: int = 10000) -> List[str]:
        """
        NCBI E-utilities üzerinden verilen gen sembolü (symbol) ve opsiyonel organizma
        adı için GeneID listesi döndürür.
        """
        if organism:
            term = f'{symbol}[Gene Name] AND "{organism}"[Organism]'
        else:
            term = f'{symbol}[Gene Name]'
        params = {'db': 'gene', 'term': term, 'retmode': 'xml', 'retmax': retmax, 'retstart': 0}
        text = self._get('esearch.fcgi', params)
        return re.findall(r"<Id>(\d+)</Id>", text)

    def gene_summaries(self, gene_ids: Iterable) -> List[dict]:
        """Birden fazla GeneID için özeti tek bir esummary isteğiyle getirir."""
        ids = [str(int(g)) for g in gene_ids]
        if not ids:
            return []
        import json
        data = json.loads(self._get('esummary.fcgi', {"db": "gene", "id": ",".join(ids), "retmode": "json"}))
        result = data.get("result", {})
        return [self._summary_from_doc(gid, result.get(gid, {})) for gid in ids if gid in result]

    def gene_summary_json(self, gene_id: int) -> dict:
        """
        Verilen GeneID için NCBI eSummary (JSON) çağrısı yapar ve
        GeneSummaryManager'daki alan adlarıyla aynı isimlerde bir dict döndürür.
        """
        found = self.gene_summaries([gene_id])
        if not found:
            raise NCBIError(f"GeneID {gene_id} bulunamadı")
        return found[0]

    @staticmethod
    def _summary_from_doc(gene_id: str, doc: dict) -> dict:
        ginfo = None
        # 'genomicinfo' genelde liste oluyor; ilk elemanı kullanıyoruz
        if isinstance(doc.get("genomicinfo"), list) and doc["genomicinfo"]:
            ginfo = doc["genomicinfo"][0]
        elif isinstance(doc.get("genomicinfo"), dict):
            ginfo = doc["genomicinfo"]

        def gi(key, default=None):
            return (ginfo or {}).get(key, default)

        def to_int(x, default=-1):
            try:
                return int(x)
            except (TypeError, ValueError):
                return default

        organism = doc.get("organism") or {}
        start, stop = to_int(gi("chrstart")), to_int(gi("chrstop"))

        result = {
            "id": str(gene_id),
            "location":            gi("chrloc"),
            "accession":           gi("chraccver"),
            "exon_count":          to_int(gi("exoncount")),
            # NCBI'ın ham değerleri: 0 tabanlı, ters iplikte start > stop
            "start":               start,
            "stop":                stop,
            "name":                doc.get("name"),
            "description":         doc.get("description"),
            "status":              to_int(doc.get("status")),
            "current_id":          doc.get("currentid"),
            "chromosome":          doc.get("chromosome"),
            "genetic_source":      doc.get("geneticsource"),
            "gene_weight":         to_int(doc.get("geneweight")),
            "other_aliases":       doc.get("otheraliases"),
            "other_designation":   doc.get("otherdesignations"),
            "summary":             doc.get("summary"),
            "map_location":        doc.get("maplocation"),
            "nomenclature_symbol": doc.get("nomenclaturesymbol"),
            "nomenclature_name":   doc.get("nomenclaturename"),
            "nomenclature_status": doc.get("nomenclaturestatus"),
            "organism":            organism.get("scientificname"),
            "organism_common":     organism.get("commonname"),
            "tax_id":              organism.get("taxid"),
            # Normalleştirilmiş koordinatlar: 1 tabanlı, seq_start <= seq_stop
            "seq_start":           None,
            "seq_stop":            None,
            "strand":              None,
            "length":              None,
        }
        if ginfo and start >= 0 and stop >= 0:
            result["seq_start"] = min(start, stop) + 1
            result["seq_stop"] = max(start, stop) + 1
            result["strand"] = -1 if start > stop else 1
            result["length"] = abs(stop - start) + 1
        return result

    def gene_sequence(self, accession: str, start: int, stop: int, strand: int = 1) -> str:
        """
        NCBI efetch (nuccore) ile verilen erişim numarası (accession) ve
        start/stop koordinatlarına (1 tabanlı) karşılık gelen nükleotid dizisini döndürür.
        strand=2 verilirse dizi ters-tamamlayıcı olarak gelir. Dönüş: büyük harf, 5'→3'.
        """
        params = {
            "db": "nuccore", "id": accession, "strand": int(strand),
            "seq_start": int(start), "seq_stop": int(stop), "rettype": "fasta", "retmode": "text",
        }
        text = self._get("efetch.fcgi", params)
        lines = [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.startswith(">")]
        seq = "".join(lines).upper()
        if not seq:
            raise NCBIError("Dizi boş döndü.")
        return seq

    def get_gene_features(self, accession: str, start: int, stop: int, timeout: int = 30) -> List[dict]:
        """
        NCBI efetch (nuccore) ile verilen accession, start, stop için features listesi döndürür.
        Konumlar istenen bölgeye göredir (bölgenin ilk bazı = 1).
        """
        params = {
            "db": "nuccore", "id": accession, "strand": 1,
            "seq_start": start, "seq_stop": stop, "rettype": "gb", "retmode": "xml",
        }
        try:
            root = ET.fromstring(self._get("efetch.fcgi", params, timeout=timeout))
        except ET.ParseError as e:
            raise NCBIError(f"NCBI cevabı çözümlenemedi: {e}") from e

        features = []
        feature_table = root.find(".//GBSeq_feature-table")
        if feature_table is not None:
            for gb_feature in feature_table.findall("GBFeature"):
                feature = {"key": None, "location": None, "quals": {}}
                for child in gb_feature:
                    if child.tag == "GBFeature_key":
                        feature["key"] = child.text
                    elif child.tag == "GBFeature_location":
                        feature["location"] = child.text
                    elif child.tag == "GBFeature_quals":
                        quals = {}
                        for qual in child.findall("GBQualifier"):
                            name_el = qual.find("GBQualifier_name")
                            value_el = qual.find("GBQualifier_value")
                            name = name_el.text if name_el is not None else ""
                            value = value_el.text if value_el is not None else ""
                            # db_xref gibi alanlar birden fazla kez tekrar edebilir
                            if name in quals and value:
                                quals[name] = f"{quals[name]}; {value}"
                            else:
                                quals[name] = value
                        feature["quals"] = quals
                features.append(feature)
        return features

    # ------------------------------------------------ gen yapısı (harita)

    def gene_structure(self, gene_id: int) -> dict:
        """
        Gen haritası için yapılandırılmış veri döndürür. Tüm koordinatlar genin kendi
        okuma yönündedir (5'→3') ve 1..length aralığındadır; ters iplikteki genler çevrilir.
        """
        summary = self.gene_summary_json(gene_id)
        if not summary.get("seq_start"):
            raise NCBIError("Bu genin genomik konumu yok.")
        length = summary["length"]
        minus = summary["strand"] == -1
        symbol = summary.get("name")

        raw = self.get_gene_features(summary["accession"], summary["seq_start"], summary["seq_stop"])
        return build_structure(raw, length=length, minus=minus, symbol=symbol, summary=summary)

    def gene_window_sequence(self, summary: dict, start: int, end: int) -> str:
        """Genin kendi koordinatlarında (1..length) verilen penceredeki diziyi döndürür."""
        if summary["strand"] == -1:
            g_start = summary["seq_stop"] - end + 1
            g_stop = summary["seq_stop"] - start + 1
            return self.gene_sequence(summary["accession"], g_start, g_stop, strand=2)
        g_start = summary["seq_start"] + start - 1
        g_stop = summary["seq_start"] + end - 1
        return self.gene_sequence(summary["accession"], g_start, g_stop, strand=1)


def build_structure(raw_features: List[dict], length: int, minus: bool,
                    symbol: Optional[str] = None, summary: Optional[dict] = None) -> dict:
    """
    efetch'ten gelen ham özellik listesinden transkript (mRNA/ncRNA), ekzon ve CDS yapısını kurar.
    Ayrı fonksiyon olmasının sebebi NCBI'a gitmeden test edilebilmesidir.
    """
    def norm(segments):
        return flip_segments(segments, length) if minus else list(segments)

    def belongs(f):
        g = (f.get("quals") or {}).get("gene")
        return symbol is None or g is None or g == symbol

    transcripts, cds_list, others = [], [], []
    gene_span = (1, length)

    for f in raw_features:
        key = f.get("key")
        if not key or key == "source" or not belongs(f):
            continue
        loc = parse_location(f.get("location") or "")
        if not loc["segments"]:
            continue
        segs = norm(loc["segments"])
        quals = f.get("quals") or {}

        if key == "gene":
            gene_span = (segs[0][0], segs[-1][1])
        elif key in ("mRNA", "ncRNA", "misc_RNA", "rRNA", "tRNA", "precursor_RNA", "lnc_RNA"):
            transcripts.append({
                "id": quals.get("transcript_id") or f"{key}-{len(transcripts) + 1}",
                "type": key,
                "product": quals.get("product"),
                "partial": loc["partial_start"] or loc["partial_end"],
                "exons": [
                    {"number": i + 1, "start": s, "end": e, "length": e - s + 1}
                    for i, (s, e) in enumerate(segs)
                ],
                "cds": None,
            })
        elif key == "CDS":
            cds_list.append({
                "protein_id": quals.get("protein_id"),
                "product": quals.get("product"),
                "segments": [{"start": s, "end": e} for s, e in segs],
                "start": segs[0][0],
                "end": segs[-1][1],
                "used": False,
            })
        elif key in ("exon", "misc_feature", "regulatory", "variation", "repeat_region",
                     "polyA_signal", "polyA_site", "sig_peptide", "mat_peptide"):
            others.append({
                "type": key,
                "label": quals.get("note") or quals.get("standard_name") or quals.get("regulatory_class"),
                "start": segs[0][0],
                "end": segs[-1][1],
            })

    # Her mRNA'ya, ekzonlarıyla uyumlu ilk kullanılmamış CDS'i eşleştir.
    for t in transcripts:
        if t["type"] != "mRNA":
            continue
        for c in cds_list:
            if not c["used"] and _cds_fits(c, t["exons"]):
                c["used"] = True
                t["cds"] = {k: v for k, v in c.items() if k != "used"}
                break

    unmatched_cds = [{k: v for k, v in c.items() if k != "used"} for c in cds_list if not c["used"]]
    return {
        "gene_id": (summary or {}).get("id"),
        "symbol": symbol,
        "length": length,
        "strand": -1 if minus else 1,
        "coordinate_system": "gene-relative, 1-based, 5'->3'",
        "gene": {"start": gene_span[0], "end": gene_span[1]},
        "transcripts": transcripts,
        "unmatched_cds": unmatched_cds,
        "features": others,
    }


def _cds_fits(cds: dict, exons: List[dict]) -> bool:
    """CDS'in her parçası bir ekzonun içinde mi ve ekzon sınırlarıyla uyumlu mu?"""
    segs = cds["segments"]
    for i, seg in enumerate(segs):
        host = next((e for e in exons if e["start"] <= seg["start"] and seg["end"] <= e["end"]), None)
        if host is None:
            return False
        # İç kenarlar (splice noktaları) ekzon sınırına denk gelmeli
        if i > 0 and seg["start"] != host["start"]:
            return False
        if i < len(segs) - 1 and seg["end"] != host["end"]:
            return False
    return True
