from flask import Blueprint, jsonify, request

from refind_utils import COMMON_ENZYMES, HUMAN_CHROMOSOME_LENGTHS, NCBIError, ReFind

MAX_WINDOW = 5000
MAX_RESULTS = 20

api = Blueprint("api", __name__, url_prefix="/api")
refind: ReFind = None


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


@api.errorhandler(ApiError)
def _api_error(e: ApiError):
    return jsonify({"error": e.message}), e.status


@api.errorhandler(NCBIError)
def _ncbi_error(e: NCBIError):
    return jsonify({"error": str(e)}), 502


def _int_arg(name: str, default=None, minimum=None, maximum=None):
    raw = request.args.get(name)
    if raw is None or raw == "":
        if default is None:
            raise ApiError(f"'{name}' parametresi gerekli")
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(f"'{name}' bir tam sayı olmalı")
    if minimum is not None and value < minimum:
        raise ApiError(f"'{name}' en az {minimum} olmalı")
    if maximum is not None and value > maximum:
        raise ApiError(f"'{name}' en fazla {maximum} olmalı")
    return value


def _summary_or_404(gene_id: int) -> dict:
    try:
        return refind.gene_summary_json(gene_id)
    except NCBIError as e:
        if "bulunamadı" in str(e):
            raise ApiError(str(e), 404)
        raise


def _chromosome_length(summary: dict):
    if str(summary.get("tax_id")) == "9606":
        return HUMAN_CHROMOSOME_LENGTHS.get(str(summary.get("chromosome")))
    return None


def _window(summary: dict):
    if not summary.get("length"):
        raise ApiError("Bu genin genomik konumu yok", 404)
    length = summary["length"]
    start = _int_arg("start", default=1, minimum=1, maximum=length)
    end = _int_arg("end", default=min(length, start + 999), minimum=start, maximum=length)
    if end - start + 1 > MAX_WINDOW:
        raise ApiError(f"Pencere en fazla {MAX_WINDOW} baz olabilir")
    return start, end


@api.get("/health")
def health():
    return jsonify({"ok": True, "enzymes": len(refind.enzymes), "api_key": bool(refind.api_key)})


@api.get("/search")
def search():
    q = (request.args.get("q") or "").strip()
    if not q:
        raise ApiError("'q' parametresi gerekli")
    organism = (request.args.get("organism") or "").strip()
    limit = _int_arg("limit", default=10, minimum=1, maximum=MAX_RESULTS)

    if q.isdigit():
        ids, total = [q], 1
    else:
        all_ids = refind.fetch_gene_ids(q, organism)
        ids, total = all_ids[:limit], len(all_ids)

    summaries = refind.gene_summaries(ids)
    results = [
        {
            "id": s["id"],
            "symbol": s["name"],
            "description": s["description"],
            "organism": s["organism"],
            "organism_common": s["organism_common"],
            "chromosome": s["chromosome"],
            "map_location": s["map_location"],
            "exon_count": s["exon_count"],
            "length": s["length"],
            "strand": s["strand"],
            "has_location": bool(s["length"]),
        }
        for s in summaries
    ]
    return jsonify({"query": q, "organism": organism or None, "total": total, "results": results})


@api.get("/genes/<int:gene_id>")
def gene(gene_id: int):
    summary = _summary_or_404(gene_id)
    summary["chromosome_length"] = _chromosome_length(summary)
    return jsonify(summary)


@api.get("/genes/<int:gene_id>/structure")
def structure(gene_id: int):
    _summary_or_404(gene_id)
    return jsonify(refind.gene_structure(gene_id))


@api.get("/genes/<int:gene_id>/sequence")
def sequence(gene_id: int):
    summary = _summary_or_404(gene_id)
    start, end = _window(summary)
    seq = refind.gene_window_sequence(summary, start, end)
    return jsonify({"gene_id": str(gene_id), "start": start, "end": end, "sequence": seq})


@api.get("/genes/<int:gene_id>/sites")
def sites(gene_id: int):
    summary = _summary_or_404(gene_id)
    start, end = _window(summary)
    names = [n.strip() for n in (request.args.get("enzymes") or "").split(",") if n.strip()]
    unknown = [n for n in names if n not in refind.enzymes]
    if unknown:
        raise ApiError(f"Bilinmeyen enzim: {', '.join(unknown)}")
    names = names or COMMON_ENZYMES

    seq = refind.gene_window_sequence(summary, start, end)
    offset = start - 1
    hits = []
    for site in refind.find_sites(seq, names):
        hits.append({
            **site,
            "match_span": [site["match_span"][0] + offset + 1, site["match_span"][1] + offset],
            "cut_top": site["cut_top"] + offset,
            "cut_bottom": site["cut_bottom"] + offset,
        })
    return jsonify({"gene_id": str(gene_id), "start": start, "end": end, "enzymes": names, "sites": hits})


@api.get("/enzymes")
def enzymes():
    q = (request.args.get("q") or "").strip().lower()
    items = [e for e in refind.enzyme_list() if not q or q in e["name"].lower()]
    return jsonify({"total": len(items), "common": COMMON_ENZYMES, "enzymes": items})
