from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

import api
from refind_utils import ReFind

app = Flask(__name__)
app.json.ensure_ascii = False
refind = ReFind()

api.refind = refind
app.register_blueprint(api.api)


@app.get("/")
def index():
    return jsonify({
        "name": "gene-nucleotide-explorer API",
        "endpoints": [
            "/api/health",
            "/api/search?q=MEFV&organism=Homo sapiens",
            "/api/genes/<id>",
            "/api/genes/<id>/structure",
            "/api/genes/<id>/sequence?start=1&end=500",
            "/api/genes/<id>/sites?start=1&end=2000&enzymes=EcoRI,BamHI",
            "/api/enzymes?q=Eco",
        ],
    })


@app.errorhandler(HTTPException)
def http_error(e: HTTPException):
    return jsonify({"error": e.description}), e.code


@app.errorhandler(Exception)
def unexpected_error(e: Exception):
    app.logger.exception(e)
    return jsonify({"error": "Sunucuda beklenmeyen bir hata oluştu."}), 500


if __name__ == "__main__":
    app.run(debug=True)
