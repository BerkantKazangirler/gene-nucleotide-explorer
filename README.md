# 🧬 ReFinder

> 🚧 **Geliştirme aşamasında.**

Gen bilgilerine ve nükleotid dizilerine NCBI veritabanları üzerinden tek bir arayüzden, teknik bilgi gerektirmeden erişmeyi amaçlayan web tabanlı bir araç.

Bu proje, **TÜBİTAK 2209-A Üniversite Öğrencileri Araştırma Projeleri Destekleme Programı** kapsamında Karabük Üniversitesi'nde yürütülmektedir.

---

## 👥 Ekip

- Proje Yürütücüsü **Berkant Kazangirler**
- Proje Ortağı **Emir Kaan Özler**
- Danışman **Dr. Öğr. Üyesi Mesut Özdağ**

---

## 🚀 Çalıştırma

İki terminal gerekir: biri Flask backend'i, diğeri React arayüzü için.

**Backend** (`backend/` klasöründen çalıştırılmalı):

```bash
cd backend
python -m venv venv-win            # Linux/macOS: python3 -m venv .venv
venv-win\Scripts\activate          # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python app.py                      # http://127.0.0.1:5000
```

İsteğe bağlı ortam değişkenleri:

- `NCBI_API_KEY`: NCBI hız sınırını saniyede 3 istekten 10 isteğe çıkarır.
- `NCBI_EMAIL`: NCBI'ın istekle birlikte gönderilmesini istediği iletişim adresi.

**Frontend:**

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

Geliştirme sırasında `/api` istekleri Vite tarafından Flask'a yönlendirilir. Backend adresi `frontend/.env` dosyasındaki `VITE_API_URL` değişkeninden okunur (örnek: `frontend/.env.example`). Dosya yoksa `http://127.0.0.1:5000` kullanılır.

**Testler** (internet bağlantısı gerektirmez):

```bash
cd backend
python -m unittest discover tests
```

---

## 🔌 API

Backend yalnızca JSON veri döndürür; arayüz tamamen `frontend/` klasöründeki React uygulamasındadır. Hatalar da `{"error": "..."}` biçiminde JSON olarak gelir. `http://127.0.0.1:5000/` adresi kullanılabilir uç noktaları listeler.

Tüm gen koordinatları genin kendi okuma yönündedir (5′→3′), 1'den başlar ve `1..length` aralığındadır. Ters iplikteki genler otomatik olarak çevrilir.

| Uç nokta | Açıklama |
|---|---|
| `GET /api/search?q=MEFV&organism=Homo sapiens` | Gen sembolü veya GeneID ile arama |
| `GET /api/genes/4210` | Gen özeti ve normalleştirilmiş koordinatlar |
| `GET /api/genes/4210/structure` | Transkriptler, ekzonlar ve kodlayan bölgeler (CDS) |
| `GET /api/genes/4210/sequence?start=1&end=500` | Gen içindeki bir pencerenin dizisi (en fazla 5000 baz) |
| `GET /api/genes/4210/sites?start=1&end=2000&enzymes=EcoRI,BamHI` | Penceredeki restriksiyon enzimi kesim noktaları |
| `GET /api/enzymes?q=Eco` | Kesim noktası bilinen enzimler (REBASE) |

---

## 📄 Lisans


