"""
ReFinder backend: sadece JSON veri sunar. Arayüz React uygulamasındadır (frontend/).
"""
from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

import api
from refind_utils import ReFind

app = Flask(__name__)
app.json.ensure_ascii = False  # Türkçe karakterler ç yerine ç olarak dönsün
refind = ReFind()

api.refind = refind
app.register_blueprint(api.api)


@app.get("/")
def index():
    """Kök adres: kullanılabilir uç noktaların listesi."""
    return jsonify({
        "name": "ReFinder API",
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
    """404, 405 gibi hatalar da HTML yerine JSON döner."""
    return jsonify({"error": e.description}), e.code


@app.errorhandler(Exception)
def unexpected_error(e: Exception):
    app.logger.exception(e)
    return jsonify({"error": "Sunucuda beklenmeyen bir hata oluştu."}), 500


if __name__ == "__main__":
    app.run(debug=True)
