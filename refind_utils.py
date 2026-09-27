import re
import requests
import xml.etree.ElementTree as ET
from typing import Dict, List, Tuple, Iterable

class ReFind:
    # IUPAC belirsizlik kodları
    IUPAC = {
        'A':'A','C':'C','G':'G','T':'T','U':'T',
        'R':'[AG]','Y':'[CT]','S':'[GC]','W':'[AT]','K':'[GT]','M':'[AC]',
        'B':'[CGT]','D':'[AGT]','H':'[ACT]','V':'[ACG]','N':'[ACGT]'
    }
    IUPAC.update({k.lower(): v for k, v in IUPAC.items()})

    def __init__(self):
        emboss_path = "database/emboss_e.dat"
        self.enzymes = self._load_emboss_enzymes(emboss_path)

    @classmethod
    def _pattern_to_regex(cls, pat: str) -> str:
        return ''.join(cls.IUPAC.get(ch, re.escape(ch)) for ch in pat)

    @staticmethod
    def _revcomp(seq: str) -> str:
        tbl = str.maketrans('ACGTacgtNnRYWSKMBDHVrywskmbdhv',
                            'TGCAtgcaNnYRWSMKVHDByrwsmkvhdb')
        return seq.translate(tbl)[::-1]

    @staticmethod
    def _overhang_info(p5: int, p3: int) -> Tuple[str, int]:
        if p5 == p3:
            return ('blunt', 0)
        elif p5 < p3:
            return ("5'-overhang", p3 - p5)
        else:
            return ("3'-overhang", p5 - p3)

    def _load_emboss_enzymes(self, path: str) -> Dict[str, dict]:
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
                    'regex': re.compile(self._pattern_to_regex(pattern), re.IGNORECASE)
                }
        return enzymes

    def _add_event(self, events, enzyme_name, start_fwd, patlen, site_idx, pos5, pos3, blunt_flag, L):
        if not (0 <= pos5 <= L and 0 <= pos3 <= L):
            return
        key = (enzyme_name, start_fwd, site_idx)
        otype, olen = self._overhang_info(pos5, pos3)
        events[key] = {
            'enzyme': enzyme_name,
            'match_span': (start_fwd, start_fwd + patlen),
            'site_index': site_idx,
            'cuts': {'five_prime': min(pos5, pos3), 'three_prime': max(pos5, pos3)},
            'overhang': {'type': otype, 'length': olen},
            'blunt': bool(blunt_flag),
        }

    def find_sites(self, sequence: str, enzyme_subset: Iterable[str] = None) -> List[dict]:
        seq = sequence.upper()
        L = len(seq)
        rc = self._revcomp(seq)
        chosen = set(enzyme_subset) if enzyme_subset else None

        events = {}

        for name, e in self.enzymes.items():
            if chosen is not None and name not in chosen:
                continue
            regex = e['regex']
            patlen = e['len']
            c1, c2, c3, c4 = e['cuts']
            blunt_flag = e['blunt']

            # + iplik
            for m in regex.finditer(seq):
                s = m.start()
                if c1 or c2:
                    self._add_event(events, name, s, patlen, 1, s + c1, s + c2, blunt_flag, L)
                if c3 or c4:
                    self._add_event(events, name, s, patlen, 2, s + c3, s + c4, blunt_flag, L)

            # – iplik
            for m in regex.finditer(rc):
                s_rc = m.start()
                start_fwd = L - (s_rc + patlen)

                if c1 or c2:
                    pos5 = L - (s_rc + c1)
                    pos3 = L - (s_rc + c2)
                    self._add_event(events, name, start_fwd, patlen, 1, pos5, pos3, blunt_flag, L)

                if c3 or c4:
                    pos5 = L - (s_rc + c3)
                    pos3 = L - (s_rc + c4)
                    self._add_event(events, name, start_fwd, patlen, 2, pos5, pos3, blunt_flag, L)

        results = list(events.values())
        results.sort(key=lambda x: (x['cuts']['five_prime'], x['enzyme'], x['site_index']))
        return results

    def fetch_gene_ids(self, symbol: str, organism: str = "") -> List[str]:
        """
        NCBI E-utilities üzerinden verilen gen sembolü (symbol) ve opsiyonel organizma
        adı için GeneID listesi döndürür.
        """
        base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
        if organism:
            term = f'{symbol}[Gene Name] AND "{organism}"[Organism]'
        else:
            term = f'{symbol}[Gene Name]'
        params = {
            'db': 'gene',
            'term': term,
            'retmode': 'xml',
            'retmax': 10000,
            'retstart': 0
        }
        r = requests.get(base, params=params, timeout=5)
        r.raise_for_status()
        # GeneID'ler <Id>...</Id> etiketlerinde döner
        ids = re.findall(r"<Id>(\d+)</Id>", r.text)
        return ids

    def gene_summary_json(self, gene_id: int) -> dict:
        """
        Verilen GeneID için NCBI eSummary (JSON) çağrısı yapar ve
        GeneSummaryManager'daki alan adlarıyla aynı isimlerde bir dict döndürür.
        """
        base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
        params = {"db": "gene", "id": gene_id, "retmode": "json"}
        r = requests.get(base, params=params, timeout=5)
        r.raise_for_status()
        data = r.json()

        doc = data.get("result", {}).get(str(gene_id), {})
        ginfo = None
        # 'genomicinfo' genelde liste oluyor; ilk elemanı kullanıyoruz
        if isinstance(doc.get("genomicinfo"), list) and doc["genomicinfo"]:
            ginfo = doc["genomicinfo"][0]
        elif isinstance(doc.get("genomicinfo"), dict):
            ginfo = doc["genomicinfo"]

        # Genomic alt alanlar güvenli çekim
        def gi(key, default=None):
            return (ginfo or {}).get(key, default)

        # Sayısal dönüşümler
        def to_int(x, default=-1):
            try:
                return int(x)
            except (TypeError, ValueError):
                return default

        # GeneSummaryManager ile aynı isimlerde JSON
        result = {
            "location":            gi("chrloc"),
            "accession":           gi("chraccver"),
            "exon_count":          to_int(gi("exoncount")),
            "start":               to_int(gi("chrstart")),
            "stop":                to_int(gi("chrstop")),
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
        }
        return result
    
    def gene_sequence(self, accession: str, start: int, stop: int, strand: int = 1) -> str:
        """
        NCBI efetch (nuccore) ile verilen erişim numarası (accession) ve
        start/stop koordinatlarına karşılık gelen nükleotid dizisini döndürür.
        Dönüş: 5'→3' yönünde tek satır string (küçük harf).
        """
        base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
        params = {
            "db": "nuccore",
            "id": accession,
            "strand": int(strand),
            "seq_start": int(start),
            "seq_stop": int(stop),
            "rettype": "gb",
            "retmode": "xml",
        }
        r = requests.get(base, params=params, timeout=10)
        r.raise_for_status()

        # XML içinden GBSeq_sequence alanını çek
        root = ET.fromstring(r.text)
        # yol: GBSet > GBSeq > GBSeq_sequence
        seq_el = root.find(".//GBSeq_sequence")
        if seq_el is None or not seq_el.text:
            # Bazı kayıtlarda küçük/büyük farklılıkları olabilir diye alternatif arama:
            for alt in root.iter():
                if alt.tag.lower().endswith("gbseq_sequence") and (alt.text or "").strip():
                    return alt.text.strip().lower()
            raise ValueError("GBSeq_sequence bulunamadı veya boş döndü.")
        return seq_el.text.strip().upper()

    def get_gene_features(self, accession: str, start: int, stop: int) -> List[dict]:
        """
        NCBI efetch (nuccore) ile verilen accession, start, stop için features listesi döndürür.
        """
        base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
        params = {
            "db": "nuccore",
            "id": accession,
            "strand": 1,
            "seq_start": start,
            "seq_stop": stop,
            "rettype": "gb",
            "retmode": "xml",
        }
        r = requests.get(base, params=params, timeout=10)
        r.raise_for_status()

        root = ET.fromstring(r.text)
        features = []
        feature_table = root.find(".//GBSeq_feature-table")
        if feature_table is not None:
            for gb_feature in feature_table.findall("GBFeature"):
                feature = {}
                for child in gb_feature:
                    if child.tag == "GBFeature_key":
                        feature["key"] = child.text
                    elif child.tag == "GBFeature_location":
                        feature["location"] = child.text
                    elif child.tag == "GBFeature_quals":
                        quals = {}
                        for qual in child.findall("GBQualifier"):
                            name = qual.find("GBQualifier_name").text if qual.find("GBQualifier_name") is not None else ""
                            value = qual.find("GBQualifier_value").text if qual.find("GBQualifier_value") is not None else ""
                            quals[name] = value
                        feature["quals"] = quals
                features.append(feature)
        return features
    

# -----------------------------
# ÖRNEK KULLANIM
# -----------------------------
"""if __name__ == "__main__":
    ref = ReFind()

    # 1) GeneID al
    ids = ref.fetch_gene_ids("MEFV", "Homo sapiens")
    gid = int(ids[0])

    # 2) Özet bilgiyi çek (accession/start/stop burada)
    info = ref.gene_summary_json(gid)

    # 3) Nükleotid dizisini getir
    seq = ref.gene_sequence_from_summary(info, strand=1)
    print(seq)
    print(len(seq), seq[:60] + "...")
"""

