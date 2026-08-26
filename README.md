# filetat-storage-proxy

Тата хи download proxy — Oracle VM дээр ажиллаж буй MinIO-ийн урд зогсож,
filetat backend (`lib/storage/s3.ts`) үүсгэдэг HMAC-signed download URL-ийг
баталгаажуулаад, зөвшөөрөгдсөн бол объектыг MinIO-оос уншиж клиент рүү
дамжуулдаг жижиг Node.js сервер.

## Яагаад хэрэгтэй вэ

filetat-ийн download URL схем:
```
GET {publicBaseUrl}/download/{encodeURIComponent(key)}?expires=<unix>&token=<hmac-hex>
```
MinIO өөрөө энэ схемийг ойлгодоггүй тул VM дээр энэ токеныг шалгаад,
зөвшөөрөгдсөн хүсэлтийг MinIO руу дамжуулдаг давхарга шаардлагатай.
Энэ repo яг тэр давхарга.

## Тохиргоо

1. `npm install`
2. `.env.example`-ийг хуулж `.env` болгоод бөглөнө:
   - `DOWNLOAD_TOKEN_SECRET` — filetat backoffice дээр тухайн backend-д
     оруулсан **яг тэр** `downloadTokenSecret`-той адил байх ёстой.
   - `MINIO_*` — тухайн backend-д оруулсан endpoint/region/accessKeyId/
     secretAccessKey/bucket-той адил.
3. `npm start` (эсвэл доорх systemd-ээр байнгын үйлчилгээ болгож ажиллуулна).

## Байнгын үйлчилгээ болгож ажиллуулах (systemd)

```bash
sudo useradd -r -s /sbin/nologin filetat   # эсвэл байгаа хэрэглэгчээ ашиглаж болно
sudo mkdir -p /opt/filetat-storage-proxy
sudo cp -r . /opt/filetat-storage-proxy
cd /opt/filetat-storage-proxy && npm install --omit=dev
sudo cp deploy/filetat-storage-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now filetat-storage-proxy
sudo systemctl status filetat-storage-proxy
```

## Cloudflare-ээр урд нь хамгаалах

1. VM-ийн нээлттэй IP рүү чиглэсэн A/AAAA бичлэг үүсгэ (жишээ:
   `oracle-storage.filetat.com`), Cloudflare-ийн **Proxied (orange cloud)**
   тохиргоог идэвхжүүл — энэ нь VM-ийн жинхэнэ IP-г нуух, DDoS хамгаалалт,
   TLS termination өгдөг.
2. SSL/TLS горимыг **Full (strict)** болгож, VM дээр жинхэнэ эсвэл
   Cloudflare Origin CA сертификат ашиглан HTTPS-ээр (443 порт) энэ
   proxy-г ажиллуулах нь зөвлөмжтэй (жишээ нь энэ Node сервэрийн урд
   Nginx/Caddy тавьж TLS-ийг тэнд бариулах). Зөвхөн локал/дотоод
   тестийн үед л энгийн HTTP (8787) ашиглаж болно.
3. filetat backoffice дээрх тухайн backend-ийн **Татах URL
   (publicBaseUrl)**-д яг энэ `https://oracle-storage.filetat.com`
   хаягийг оруулна.

## Шалгах

```bash
curl -I https://oracle-storage.filetat.com/health
```
`200 ok` буцвал proxy зөв ажиллаж байна. Бодит татах URL-ыг backoffice
дээрх backend идэвхжүүлсний дараа filetat-аас файл татаж шалгана.
