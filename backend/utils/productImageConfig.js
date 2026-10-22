export const PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PRODUCT_IMAGE_TYPE_SET = new Set(PRODUCT_IMAGE_TYPES);
export const SHARP_IMAGE_TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const MAX_PRODUCT_IMAGES = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8000;
export const MAX_IMAGE_PIXELS = 40_000_000;
