// Public reference parsing only. No Google client or private file access.
const clean=value=>String(value??'').trim();
const DRIVE_FOLDER_ID_PATTERN=/^[A-Za-z0-9_-]{10,128}$/;
export function extractDriveFileId(link) {
  const value = clean(link);
  if (!value) return "";

  try {
    const url = new URL(value, "https://m4l.invalid");
    const workerMatch = /^\/api\/library\/drive\/file\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if (workerMatch) return workerMatch[1];

    const driveFileMatch = /^\/file\/d\/([A-Za-z0-9_-]+)/.exec(url.pathname);
    if (url.hostname === "drive.google.com" && driveFileMatch) return driveFileMatch[1];

    const queryId = url.searchParams.get("id");
    if ((url.hostname === "drive.google.com" || url.hostname === "docs.google.com") && queryId) {
      return clean(queryId);
    }
  } catch (error) {
    return "";
  }

  return "";
}

export function extractGoogleDriveFolderId(value) {
  const text = clean(value);

  if (!text) {
    throw new Error("A Google Drive folder reference is required");
  }

  if (DRIVE_FOLDER_ID_PATTERN.test(text)) {
    return text;
  }

  let url;

  try {
    url = new URL(text);
  } catch {
    throw new Error("Enter a valid Google Drive folder URL or folder ID");
  }

  if (url.protocol !== "https:" || url.hostname !== "drive.google.com") {
    throw new Error("Enter a Google Drive folder URL or folder ID");
  }

  const folderPathMatch = url.pathname.match(/\/drive\/folders\/([A-Za-z0-9_-]+)/);
  const candidate = folderPathMatch ? folderPathMatch[1] : clean(url.searchParams.get("id"));

  if (!DRIVE_FOLDER_ID_PATTERN.test(candidate)) {
    throw new Error("The Google Drive folder URL does not contain a valid folder ID");
  }

  return candidate;
}

export function buildGoogleDriveFolderUrl(folderId) {
  const safeFolderId = extractGoogleDriveFolderId(folderId);
  return `https://drive.google.com/drive/folders/${encodeURIComponent(safeFolderId)}`;
}
