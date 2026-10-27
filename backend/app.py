from flask import Flask, render_template, request

import api
from refind_utils import ReFind

app = Flask(__name__)
app.jinja_env.globals.update(enumerate=enumerate)
refind = ReFind()

# React arayüzünün kullandığı JSON uç noktaları (/api/...)
api.refind = refind
app.register_blueprint(api.api)

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/search', methods=['POST'])
def search():
    gene_symbol = request.form.get('gene_symbol')
    if gene_symbol:
        gene_ids = refind.fetch_gene_ids(gene_symbol)
        results = []
        for gid in gene_ids[:10]:  # İlk 10'u al, performans için
            try:
                summary = refind.gene_summary_json(int(gid))
                summary_html = f"""
                <div class="d-flex flex-wrap gap-2 mb-2">
                    <span class="badge bg-primary">Location: {summary.get('location', 'N/A')}</span>
                    <span class="badge bg-secondary">Accession: {summary.get('accession', 'N/A')}</span>
                    <span class="badge bg-secondary">Başlangıç: {summary.get('start', 'N/A')}</span>
                    <span class="badge bg-secondary">Bitiş: {summary.get('stop', 'N/A')}</span>
                    <span class="badge bg-success">Exon Count: {summary.get('exon_count', 'N/A')}</span>
                    <span class="badge bg-info">Description: {summary.get('description', 'N/A')}</span>
                </div>
                <p><strong>Summary:</strong> {summary.get('summary', 'N/A')}</p>
                """
                results.append({'id': gid, 'summary': summary_html, 'accession': summary.get('accession'), 'start': summary.get('seq_start'), 'stop': summary.get('seq_stop')})
            except Exception as e:
                results.append({'id': gid, 'summary': f'<span class="text-danger">Hata: {str(e)}</span>'})
        return render_template('home.html', results=results)
    return render_template('home.html')

@app.route('/features/<gid>/<accession>/<int:start>/<int:stop>')
def features(gid, accession, start, stop):
    try:
        features_list = refind.get_gene_features(accession, start, stop)
        features_text = "\n".join([f"{f['key']}: {f['location']} - {f['quals']}" for f in features_list])
        return features_text
    except Exception as e:
        return f"Hata: {str(e)}"

@app.route('/result/<gid>/<accession>/<int:start>/<int:stop>')
def result(gid, accession, start, stop):
    try:
        features_list = refind.get_gene_features(accession, start, stop)
        return render_template('result.html', gid=gid, features=features_list)
    except Exception as e:
        return render_template('result.html', gid=gid, features=[], error=str(e))

if __name__ == '__main__':
    app.run(debug=True)