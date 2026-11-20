import os

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

import api
from refind_utils import ReFind

app = Flask(__name__)
app.json.ensure_ascii = False
refind = ReFind()

api.refind = refind
app.register_blueprint(api.api)

CORS_ORIGINS = [o.strip().rstrip("/") for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]


@app.after_request
def cors(response):
    origin = request.headers.get("Origin")
    if "*" in CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = "*"
    elif origin and origin.rstrip("/") in CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers.add("Vary", "Origin")
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    return response


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
