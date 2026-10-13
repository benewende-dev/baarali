// BAARALI(13/10/2026): GIF exports are images, so the Studio must not
// hand them to HyperFrames' HTMLVideoElement used for MP4 and WebM.
export const isMotionImage = (path: string) => /\.(gif|png|jpe?g|webp|svg)(?:[?#].*)?$/i.test(path);
export const canPreviewMotionExport = (path: string) => isMotionImage(path) || /\.(mp4|webm)(?:[?#].*)?$/i.test(path);
