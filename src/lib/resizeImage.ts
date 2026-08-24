/**
 * Redimensionne/compresse une image côté navigateur (canvas) et renvoie une
 * data URL JPEG prête à stocker. Évite de faire exploser la taille de la
 * ligne `profiles` avec une photo brute de plusieurs Mo issue d'un téléphone.
 */
export function resizeImageToDataUrl(
  file: File,
  maxSize = 512,
  quality = 0.85,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Lecture du fichier impossible"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image invalide"));
      img.onload = () => {
        const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Contexte canvas indisponible"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Même principe que `resizeImageToDataUrl`, mais renvoie un vrai `File` JPEG
 * (et non une data URL) — pour les envois vers Supabase Storage, où l'on
 * uploade le fichier tel quel. Sert à deux choses dans le vestiaire :
 *  - faire passer sous la limite du bucket une photo brute de téléphone
 *    (souvent 5-10 Mo) au lieu de la refuser ;
 *  - convertir en JPEG les formats que le bucket n'accepte pas et que les
 *    navigateurs n'affichent pas (HEIC/HEIF d'iPhone), quand le navigateur
 *    sait au moins les décoder (c'est le cas de Safari iOS).
 */
export function resizeImageToJpegFile(
  file: File,
  maxSize = 1920,
  quality = 0.85,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Lecture du fichier impossible"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image invalide"));
      img.onload = () => {
        const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Contexte canvas indisponible"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Conversion de l'image impossible"));
              return;
            }
            const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
            resolve(new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }));
          },
          "image/jpeg",
          quality,
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
