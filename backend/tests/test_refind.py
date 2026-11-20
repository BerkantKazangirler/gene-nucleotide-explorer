import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from refind_utils import ReFind, build_structure, flip_segments, parse_location

REFIND = ReFind()


def site(results, enzyme):
    return [r for r in results if r["enzyme"] == enzyme]


class FindSitesTest(unittest.TestCase):
    def test_ecori_leaves_5_prime_overhang(self):
        hits = site(REFIND.find_sites("TTTTGAATTCTTTT", ["EcoRI"]), "EcoRI")
        self.assertEqual(len(hits), 1)
        self.assertEqual((hits[0]["cut_top"], hits[0]["cut_bottom"]), (5, 9))
        self.assertEqual(hits[0]["overhang"], {"type": "5'-overhang", "length": 4})

    def test_psti_leaves_3_prime_overhang(self):
        hits = site(REFIND.find_sites("TTCTGCAGTT", ["PstI"]), "PstI")
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]["overhang"]["type"], "3'-overhang")
        self.assertEqual(hits[0]["cut_top"], 7)

    def test_smai_is_blunt(self):
        hits = site(REFIND.find_sites("AACCCGGGAA", ["SmaI"]), "SmaI")
        self.assertEqual(len(hits), 1)
        self.assertTrue(hits[0]["blunt"])
        self.assertEqual(hits[0]["cut_top"], 5)

    def test_overlapping_sites_found_on_forward_strand(self):
        hits = site(REFIND.find_sites("GCGCGC", ["HhaI"]), "HhaI")
        self.assertEqual(sorted(h["match_span"][0] for h in hits), [0, 2])
        for h in hits:
            self.assertEqual(h["overhang"]["type"], "3'-overhang")

    def test_negative_cut_offset(self):
        hits = site(REFIND.find_sites("AAGATCAA", ["DpnII"]), "DpnII")
        self.assertEqual(len(hits), 1)
        self.assertEqual((hits[0]["cut_top"], hits[0]["cut_bottom"]), (2, 6))

    def test_non_palindromic_reverse_strand(self):
        seq = "A" * 10 + "GAGACC" + "A" * 10
        hits = site(REFIND.find_sites(seq, ["BsaI"]), "BsaI")
        self.assertEqual(len(hits), 1)
        h = hits[0]
        self.assertEqual(h["strand"], -1)
        self.assertEqual(h["overhang"], {"type": "5'-overhang", "length": 4})
        self.assertEqual((h["cut_top"], h["cut_bottom"]), (5, 9))

    def test_enzyme_without_known_cut_is_skipped(self):
        self.assertEqual(REFIND.find_sites("CCATGAAGCC", ["EcoNIH6II"]), [])

    def test_database_path_independent_of_cwd(self):
        cwd = os.getcwd()
        try:
            os.chdir(os.path.sep)
            self.assertGreater(len(ReFind().enzymes), 1000)
        finally:
            os.chdir(cwd)


class ParseLocationTest(unittest.TestCase):
    def test_simple_range(self):
        loc = parse_location("1..500")
        self.assertEqual(loc["strand"], 1)
        self.assertEqual(loc["segments"], [(1, 500)])

    def test_join(self):
        self.assertEqual(parse_location("join(1..120,4500..4700)")["segments"], [(1, 120), (4500, 4700)])

    def test_complement_join(self):
        loc = parse_location("complement(join(20..30,5..9))")
        self.assertEqual(loc["strand"], -1)
        self.assertEqual(loc["segments"], [(5, 9), (20, 30)])

    def test_partial_and_single_base(self):
        loc = parse_location("join(<1..50,77,90..>120)")
        self.assertEqual(loc["segments"], [(1, 50), (77, 77), (90, 120)])
        self.assertTrue(loc["partial_start"] and loc["partial_end"])

    def test_remote_reference_skipped(self):
        self.assertEqual(parse_location("join(NC_000001.1:1..5,10..20)")["segments"], [(10, 20)])

    def test_flip(self):
        self.assertEqual(flip_segments([(1, 10), (91, 100)], 100), [(1, 10), (91, 100)])
        self.assertEqual(flip_segments([(1, 10), (50, 60)], 100), [(41, 51), (91, 100)])


SYNTHETIC_FEATURES = [
    {"key": "source", "location": "1..1000", "quals": {}},
    {"key": "gene", "location": "complement(1..1000)", "quals": {"gene": "TEST1"}},
    {"key": "mRNA", "location": "complement(join(1..100,301..400,901..1000))",
     "quals": {"gene": "TEST1", "transcript_id": "NM_TEST.1", "product": "variant 1"}},
    {"key": "mRNA", "location": "complement(join(1..100,901..1000))",
     "quals": {"gene": "TEST1", "transcript_id": "NM_TEST.2", "product": "variant 2"}},
    {"key": "CDS", "location": "complement(join(51..100,301..400,901..950))",
     "quals": {"gene": "TEST1", "protein_id": "NP_TEST.1"}},
    {"key": "CDS", "location": "complement(join(51..100,901..950))",
     "quals": {"gene": "TEST1", "protein_id": "NP_TEST.2"}},
    {"key": "mRNA", "location": "200..300", "quals": {"gene": "OTHER", "transcript_id": "NM_OTHER.1"}},
]


class BuildStructureTest(unittest.TestCase):
    def setUp(self):
        self.s = build_structure(SYNTHETIC_FEATURES, length=1000, minus=True, symbol="TEST1")

    def test_other_genes_are_filtered(self):
        self.assertEqual([t["id"] for t in self.s["transcripts"]], ["NM_TEST.1", "NM_TEST.2"])

    def test_minus_strand_flipped_to_gene_orientation(self):
        exons = self.s["transcripts"][0]["exons"]
        self.assertEqual([(e["start"], e["end"]) for e in exons], [(1, 100), (601, 700), (901, 1000)])
        self.assertEqual([e["number"] for e in exons], [1, 2, 3])

    def test_cds_matched_to_compatible_transcript(self):
        self.assertEqual(self.s["transcripts"][0]["cds"]["protein_id"], "NP_TEST.1")
        self.assertEqual(self.s["transcripts"][1]["cds"]["protein_id"], "NP_TEST.2")
        self.assertEqual(self.s["unmatched_cds"], [])
        self.assertEqual(self.s["transcripts"][0]["cds"]["start"], 51)


class ApiTest(unittest.TestCase):

    SUMMARY = {
        "result": {
            "uids": ["999"],
            "999": {
                "name": "TEST1", "description": "test gene", "chromosome": "16",
                "maplocation": "16p13.3",
                "organism": {"scientificname": "Homo sapiens", "commonname": "human", "taxid": 9606},
                "genomicinfo": [{"chrloc": "16", "chraccver": "NC_TEST.1", "chrstart": 10999,
                                 "chrstop": 10000, "exoncount": 3}],
            },
        }
    }

    def setUp(self):
        import api
        import app as app_module
        self.refind = app_module.refind
        self.refind._cache.clear()
        self.client = app_module.app.test_client()
        self.api = api
        self.calls = []

        def fake_get(endpoint, params, timeout=15):
            self.calls.append((endpoint, params))
            if endpoint == "esearch.fcgi":
                return "<eSearchResult><Id>999</Id><Id>1000</Id></eSearchResult>"
            if endpoint == "esummary.fcgi":
                return json.dumps(self.SUMMARY)
            if endpoint == "efetch.fcgi" and params.get("rettype") == "fasta":
                n = int(params["seq_stop"]) - int(params["seq_start"]) + 1
                return ">x\n" + ("GAATTC" + "A" * n)[:n]
            if endpoint == "efetch.fcgi":
                return _gbxml(SYNTHETIC_FEATURES)
            raise AssertionError(endpoint)

        patcher = mock.patch.object(self.refind, "_get", side_effect=fake_get)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_search_uses_single_summary_request(self):
        r = self.client.get("/api/search?q=TEST1")
        self.assertEqual(r.status_code, 200)
        body = r.get_json()
        self.assertEqual(body["total"], 2)
        self.assertEqual(body["results"][0]["symbol"], "TEST1")
        self.assertEqual(body["results"][0]["strand"], -1)
        self.assertEqual(sum(1 for e, _ in self.calls if e == "esummary.fcgi"), 1)

    def test_gene_normalized_coordinates(self):
        body = self.client.get("/api/genes/999").get_json()
        self.assertEqual((body["seq_start"], body["seq_stop"], body["length"]), (10001, 11000, 1000))
        self.assertEqual(body["chromosome_length"], 90338345)

    def test_structure(self):
        body = self.client.get("/api/genes/999/structure").get_json()
        self.assertEqual(len(body["transcripts"]), 2)
        fetch = [p for e, p in self.calls if e == "efetch.fcgi"][0]
        self.assertEqual((fetch["seq_start"], fetch["seq_stop"]), (10001, 11000))

    def test_sequence_window_on_minus_strand(self):
        r = self.client.get("/api/genes/999/sequence?start=1&end=10")
        self.assertEqual(r.status_code, 200)
        fetch = [p for e, p in self.calls if e == "efetch.fcgi"][0]
        self.assertEqual((fetch["seq_start"], fetch["seq_stop"], fetch["strand"]), (10991, 11000, 2))

    def test_sites_are_gene_relative(self):
        body = self.client.get("/api/genes/999/sites?start=101&end=200&enzymes=EcoRI").get_json()
        self.assertEqual(body["sites"][0]["cut_top"], 101)

    def test_only_json_no_html(self):
        r = self.client.get("/")
        self.assertEqual(r.content_type, "application/json")
        self.assertIn("/api/search?q=MEFV&organism=Homo sapiens", r.get_json()["endpoints"])
        for url, method in [("/yok", "get"), ("/search", "post"), ("/api/search", "post")]:
            r = getattr(self.client, method)(url)
            self.assertIn(r.status_code, (404, 405))
            self.assertEqual(r.content_type, "application/json")
            self.assertIn("error", r.get_json())

    def test_cors_header(self):
        r = self.client.get("/api/health", headers={"Origin": "https://gne.berkantkazangirler.tech"})
        self.assertEqual(r.headers.get("Access-Control-Allow-Origin"), "*")
        r = self.client.options("/api/search", headers={"Origin": "https://gne.berkantkazangirler.tech"})
        self.assertIn("GET", r.headers.get("Access-Control-Allow-Methods", ""))

    def test_unexpected_error_is_json(self):
        with mock.patch.object(self.refind, "fetch_gene_ids", side_effect=RuntimeError("boom")):
            r = self.client.get("/api/search?q=TEST1")
        self.assertEqual(r.status_code, 500)
        self.assertEqual(r.content_type, "application/json")

    def test_validation_errors(self):
        self.assertEqual(self.client.get("/api/search").status_code, 400)
        self.assertEqual(self.client.get("/api/genes/999/sites?enzymes=Yok").status_code, 400)
        self.assertEqual(self.client.get("/api/genes/999/sequence?start=1&end=9000").status_code, 400)


def _gbxml(features):
    parts = []
    for f in features:
        quals = "".join(
            f"<GBQualifier><GBQualifier_name>{k}</GBQualifier_name>"
            f"<GBQualifier_value>{v}</GBQualifier_value></GBQualifier>"
            for k, v in f["quals"].items()
        )
        parts.append(
            f"<GBFeature><GBFeature_key>{f['key']}</GBFeature_key>"
            f"<GBFeature_location>{f['location']}</GBFeature_location>"
            f"<GBFeature_quals>{quals}</GBFeature_quals></GBFeature>"
        )
    return f"<GBSet><GBSeq><GBSeq_feature-table>{''.join(parts)}</GBSeq_feature-table></GBSeq></GBSet>"


if __name__ == "__main__":
    unittest.main()
