# SignPath P0 düzeltmeleri — uygulama planı

**Tarih:** 14 Ekim 2026
**Kapsam:** Başvuru gönderilmeden önce kapatılması gerecek dört engel
**Durum:** Uygulandı (bu commit), aşağıdaki kontrol listesi commit'in kapsamıdır

---

## 1. Neden bu sıra

Dört engelden ikisi metin, biri kod varsayılanı, biri insan kararı. Sıra şöyle
belirlendi:

1. **Kod önce, sonra metin.** Gizlilik varsayılanını değiştirmeden önce
   politikayı yazmak, "kullanıcı isteği dışında üçüncü tarafa gidiyor" diye
   yazıp sonra "aslında kapalı" demek olurdu. Önce davranış değişti, metin
   davranışı anlatıyor.
2. **Metin kaynağından üretilir.** Site elle yazılmış sayfalardan oluşuyor;
   her biri için 12 dilde elle düzenlemek, 12 çevirinin birbirinden ayrışması
   demek. Bunun yerine sözlükler güncellendi, `generate-locales.cjs` 11
   çeviriyi sayfaya yazdı.
3. **İnsan kararı en sona.** İkinci onaylayan bulunamadan o role dair metin
   yazmak, gerçek kişi adını yazmış olmak anlamına gelirdi.

---

## 2. P0-1 — Gizlilik: sızmış şifre denetimi

### 2a. Varsayılanı kapalı yap

**Dosya:** `src/lib/hibp.ts`

`isHibpCheckEnabled()` `stored !== 'false'` okuyordu; hiç sorulmamış bir kurulum
"evet" cevap veriyordu. Artık `=== 'true'`.

Güvenlik kaybı yok: istek zaten k-anonimlikle gidiyor, giden veri şifrenin
SHA-1 özetinin ilk beş hex karakteri. Kaybedilen tek şey, kullanıcının
kararını biz vermesi.

**Geriye dönük uyum:** anahtar yalnızca `setHibpCheckEnabled()` ile yazılıyor.
Daha önce açan kullanıcıda `'true'` durur ve açık kalır; kapatan kullanıcıda
`'false'` durur ve kapalı kalır. Yalnızca hiç sorulmamış durum hareket eder.

**Testler:** `src/lib/hibp.test.ts` — varsayılan kapalı, karar kalıcı, aç/kapat
döngüsü. `src/components/SecurityAudit.test.tsx` — ekran "OFF" ile başlıyor,
ilk tık açıyor, ikinci tık kapatıyor.

Bu test dosyasındaki `vi.mock('../lib/hibp')` stub'ı kaldırıldı: stub her
 çağrıya "açık" cevap verdiği için, varsayılan değişimi hiçbir test yakalayamazdı.
Mock artık gerçek modülü sarıyor, yalnızca ağ çağrısını taklit ediyor.

### 2b. Etiketleri düzelt

**Dosyalar:** `src/i18n/locales/*.ts` (12 dil), uygulayan
`scripts/apply-hibp-optin-labels.cjs`

İki etiket eski varsayılanı anlatıyordu: `OFFLINE` ve
`Offline (HIBP Disabled)`. "Offline" bir ağ durumudur; bu bir kullanıcı kararıdır
ve kalıcıdır. Yeni metinler: rozet `KAPALI`/`OFF`/…, açıklama
`Kapalı — HIBP sorgusu yapılmıyor` / `Disabled — no HIBP lookup` / …

### 2c. Gizlilik politikasına yaz

**Dosyalar:** `kalderashield-website/privacy.html` (Türkçe okunabilir varsayılan),
`assets/js/i18n/*.json` (12 dil), uygulayan
`scripts/apply-privacy-breach-check-i18n.cjs`

İki yeni anahtar eklendi: `privacy-p1-2b` (bölüm 2, kasa verisi hiçbir sunucuya
gitmez — tek istisna) ve `privacy-p1-5b` (bölüm 5, HIBP k-anonimliği: ne
gönderilir, kime, varsayılan kapalı, nasıl kapatılır).

Mevcut iki paragraf **yeniden yazılmadı**, çünkü onlar 12 dilde zaten var ve
yeniden yazmak, o cümlelerin "ne olması gerektiğini" on iki çeviriyle yeniden
tartışmak demekti. Yeni paragraf tek başına çevrilip tek başına
karşılaştırılabilir.

### 2d. İmza politikasındaki yanlış cümleyi düzelt

**Dosya:** `CODE_SIGNING_POLICY.md`

Eski metin: *"The Windows binaries contain no network client of any kind."*
Bu doğru değildi. Yeni metin hava-gap politikasını, tek istisnayı ve k-anonimlik
özelliğini anlatıyor; varsayılanın neden değiştiğini de açıklıyor.

Politika yalnızca doğruysa yayımlanmaya değer. Bir sertifika kuruluşu bu
metni yakından okuyor.

---

## 3. P0-2 — Ana sayfada kod imza politikası bağlantısı

**Dosyalar:** `kalderashield-website/index.html`, `assets/js/i18n/*.json`,
uygulayan `scripts/apply-home-csp-link-i18n.cjs`

SignPath şartı: politika **ana sayfada** bulunmalı, terim ana sayfa ve indirme
sayfalarında kullanılmalı. Politika sayfası 12 dilde vardı, indirme sayfası 12
dilde bağlıydı, **ana sayfa hiçbir dilde bağlamıyordu**.

Bağlantı footer'ın "Yasal" sütununa, gizlilik politikasının yanına eklendi.
İngilizce metin şarttaki terimi birebir taşıyor (`Code signing policy`), diğer
on bir dil çeviriyor.

---

## 4. P0-3 — Onaylayıcı (insan kararı, commit dışında)

Şu an Authors, Reviewers ve Approvers rollerinin üçü de `hafgit99`. Politika
metni bunu zaten "Known gap" olarak açıkça yazıyor; bu değişiklikte metne ek
olarak, başvuru öncesi kapatılması gereken yapısal kalem olduğu da vurgulandı.

**Bu maddede değişiklik yok, çünkü ikinci kişiyi ben atayamam.** Karar şu:

| Seçenek | Ne gerekir | Risk |
|---|---|---|
| Gerçek ikinci onaylayan | Uygulamanın arkasındaki kişiden, GitHub'da collaborator | En güçlü |
| İkinci hesap + CODEOWNERS zorunlu inceleme | Yönetici kararı | Orta |
| Solo başvuru | Karar | Yüksek ret riski, düşük itibar riski |

---

## 5. P0-4 — Doğrulanması gereken iki madde (insan, commit dışında)

**MFA:** `CODE_SIGNING_POLICY.md` tüm yazma yetkili hesaplarda MFA olduğunu
beyan ediyor. Depo dışından görülemez. GitHub ayarlarından teyit edilmeli.

**`security@kalderashield.com`:** Başvuru sonrası iletişim e-posta ile. Bu
adres izlenmiyorsa başvuru sessizce ölür. `kalderashield.com` canlı olduğu için
MX kaydı kontrol edilmeli.

---

## 6. Bağımlılık danışmaları (P1'den alındı, ucuz olduğu için)

**Dosya:** `package.json` `overrides`

| Danışma | Önce | Sonra |
|---|---|---|
| GHSA-68fv-2mgg-jv7q (**HIGH**) — source-map-js olay döngüsü DoS | 1.2.1 | **1.2.2** |
| GHSA-ch52-4w7c-c8xp (**HIGH**) — http-cache-semantics çapraz kullanıcı önbellek sızıntısı | 4.2.0 | **4.3.0** |

İkisi de **devDependencies** zincirinden geliyor (`@tailwindcss/node`,
`postcss`, `node-gyp`); yayımlanan Windows ikilisine girmiyor. Yine de OSV
çıktısı boş görünmeye değer: bir gözden geçiren `npm audit` çalıştırıyor ve
ikisinin de HIGH olması, düzeltilebilecek bir şeyin açıkta bırakıldığı anlamına
geliyor.

Sonuç: `npm audit` → **0 açık** (daha önce 1 high).

Kalan Rust tarafı danışmaları (`glib` unsound, `unic-*` bakımı bırakılmış) Tauri
bağımlılığı ve Linux hedefine özgü; gerekçeleri `docs/` altında ayrı bir notta
belgelenecek.

---

## 7. Doğrulama

| Kapı | Sonuç |
|---|---|
| `npm run test:unit` | **2383 test, 259 dosya, hepsi geçti** |
| `npm run typecheck` | Temiz |
| `npm run lint` | 0 hata, 23 uyarı (değişiklik öncesiyle aynı) |
| `npm audit` | 0 açık |
| `npm run security:release-signing` | PASS |
| `npm run security:dependencies` | 0 açık |
| `npm run i18n:audit` | 12 dil, %100 anahtar eşitliği |
| `npm run audit:doc-links` | PASS |
| Site kapıları (16 adet) | Hepsi PASS |
| Üreticiler zinciri | Yeniden üretilebilir, `git diff` yok |
| `audit-i18n` | 78 bulgu — değişiklik öncesiyle **aynı**, yeni bulgu yok |

---

## 8. Bu değişiklikten sonra başvuru durumu

| Ön koşul | Durum |
|---|---|
| İmzalanacak biçimde Windows sürümü yayımlanmış | ✅ (5 önizleme sürümü) |
| Proje sayfası canlı | ✅ |
| Politika ana sayfa + indirme sayfasında bağlı, 12 dil | ✅ (bu değişiklik) |
| Gizlilik politikası davranışı anlatıyor | ✅ (bu değişiklik) |
| İmza politikası kodla tutarlı | ✅ (bu değişiklik) |
| MFA teyidi | ⏳ bakımcı |
| Güvenlik e-postası yanıt süresi | ⏳ bakımcı |
| İkinci onaylayan | ⏳ bakımcı kararı |
| Formun doldurulup gönderilmesi | ⏳ manuel adım |

Sekiz maddenin beşi kapandı. Kalan üçü insan kararı gerektiriyor ve ikisi
beş dakikalık bir kontrol.