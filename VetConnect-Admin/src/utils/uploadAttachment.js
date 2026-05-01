/**
 * uploadAttachment.js — T4.121
 *
 * Single-responsibility upload pipeline for clinical file attachments.
 * Handles validation, optional Canvas-based image compression, Firebase
 * Storage upload, and returns a fully-populated metadata object ready to
 * persist on the medical_records document.
 *
 * Contract:
 *   - Throws descriptive Error on validation failure (caller shows Snackbar)
 *   - Returns metadata object; never returns null on success
 *   - PDFs are uploaded as-is (no compression)
 *   - Images are compressed to max 1200px wide, JPEG 0.7; second pass at 0.5
 *     if still above 500 KB
 */

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebaseConfig';
import { Timestamp } from 'firebase/firestore';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;      // 5 MB hard cap
const COMPRESS_TARGET_BYTES = 500 * 1024;    // 500 KB soft target after compression
const MAX_IMAGE_DIMENSION = 1200;             // px — width cap; height scales proportionally

/**
 * Strips unsafe characters from a label to produce a safe Storage filename segment.
 * Spaces → underscores; non-alphanumeric (except _-.) → removed; truncated to 50 chars.
 *
 * @param {string} label
 * @returns {string}
 */
function sanitizeLabel(label) {
  return label
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-.]/g, '')
    .slice(0, 50);
}

/**
 * Compresses an image File using the browser Canvas API.
 * Scales width to MAX_IMAGE_DIMENSION (maintaining aspect ratio) if larger.
 * Attempts JPEG quality 0.7 first; falls back to 0.5 if still over COMPRESS_TARGET_BYTES.
 *
 * @param {File} file
 * @returns {Promise<{ blob: Blob, mimeType: string }>}
 */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > MAX_IMAGE_DIMENSION) {
        height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
        width = MAX_IMAGE_DIMENSION;
      }

      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (firstBlob) => {
          if (!firstBlob) {
            reject(new Error('Canvas compression produced no output.'));
            return;
          }

          if (firstBlob.size <= COMPRESS_TARGET_BYTES) {
            resolve({ blob: firstBlob, mimeType: 'image/jpeg' });
            return;
          }

          // Second pass at lower quality
          canvas.toBlob(
            (secondBlob) => {
              resolve({ blob: secondBlob || firstBlob, mimeType: 'image/jpeg' });
            },
            'image/jpeg',
            0.5,
          );
        },
        'image/jpeg',
        0.7,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image could not be decoded for compression.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Validates, optionally compresses, uploads a file to Firebase Storage, and
 * returns a structured metadata object for persisting on medical_records.
 *
 * @param {object} params
 * @param {File}   params.file        - The browser File object selected by the user
 * @param {string} params.petId       - Pet document ID (path segment)
 * @param {string} params.recordId    - Medical record document ID (path segment)
 * @param {string} params.label       - Human-readable label (editable by vet)
 * @param {string} params.uploadedBy  - Display name of the uploading staff member
 * @returns {Promise<{
 *   url: string,
 *   label: string,
 *   type: string,
 *   clientVisible: boolean,
 *   uploadedBy: string,
 *   uploadedAt: import('firebase/firestore').Timestamp,
 *   fileName: string,
 *   fileSize: number,
 *   mimeType: string,
 * }>}
 */
export async function uploadAttachment({ file, petId, recordId, label, uploadedBy }) {
  // --- Validation ---
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Only JPEG, PNG, and PDF files are accepted.');
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File must be under 5 MB.');
  }

  // --- Compression (images only) ---
  let uploadBlob = file;
  let finalMimeType = file.type;

  if (file.type.startsWith('image/')) {
    const compressed = await compressImage(file);
    uploadBlob = compressed.blob;
    finalMimeType = compressed.mimeType;
  }

  // --- Upload ---
  const safeLabel = sanitizeLabel(label || file.name || 'attachment');
  const storagePath = `attachments/${petId}/${recordId}/${Date.now()}_${safeLabel}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, uploadBlob, { contentType: finalMimeType });
  const url = await getDownloadURL(storageRef);

  // --- Return metadata ---
  return {
    url,
    label: label || file.name,
    type: 'other',           // caller overrides with att.type before persisting
    clientVisible: false,    // invariant: default hidden; vet must explicitly share
    uploadedBy,
    uploadedAt: Timestamp.now(),
    fileName: file.name,
    fileSize: uploadBlob.size,
    mimeType: finalMimeType,
  };
}
