var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../../../../../../Users/hbnaidu/.codex/.chatgpt-projects/g-p-6ab255fb8710819189b4ee1da081d7f6/work/Academy-existing-playlist-bridge-20261104/functions/_lib/academy-archive-list.js
var LIST_API = "https://archive.org/services/users/@hbn_naidu/lists/1";
var IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
var MAX_ITEMS = 200;
var MAX_PDFS_PER_ITEM = 100;
var MAX_MEDIA_FILES_PER_ITEM = 250;
var IHYA_VOLUMES = [
  { number: 1, listedId: "IhyaUlumAlDinVol1_201503", sourceId: "IhyaUlumAlDinVol1_201503" },
  { number: 2, listedId: "IhyaUlumAlDinVol2", sourceId: "IhyaUlumAlDinVol2" },
  { number: 3, listedId: "IhyaUlumAlDinVol3", sourceId: "IhyaUlumAlDinVol3" },
  // The list's Vol4 scan has a Vol. III title page. Use the matching Vol. IV scan.
  { number: 4, listedId: "IhyaUlumAlDinVol4", sourceId: "GAZALIIhyaUlumAlDin4" }
];
var IHYA_LIST_IDS = new Set(IHYA_VOLUMES.map((volume) => volume.listedId));
IHYA_LIST_IDS.add("GAZALIIhyaUlumAlDin4");
async function readJson(response) {
  if (!response.ok) throw new Error(`Archive.org returned ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Archive.org returned an empty response");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2e6) {
      await reader.cancel();
      throw new Error("Archive.org metadata exceeded the size limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
__name(readJson, "readJson");
async function archiveJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    redirect: "manual"
  });
  return readJson(response);
}
__name(archiveJson, "archiveJson");
async function listedIdentifiers() {
  const data = await archiveJson(LIST_API);
  const members = data?.value?.members;
  if (!Array.isArray(members)) throw new Error("Archive.org list format is unavailable");
  if (members.length > MAX_ITEMS) throw new Error("Archive.org list exceeds the supported size");
  return [...new Set(members.map((member) => member?.identifier).filter((identifier) => typeof identifier === "string" && IDENTIFIER.test(identifier)))];
}
__name(listedIdentifiers, "listedIdentifiers");
async function itemMetadata(identifier) {
  return archiveJson(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
}
__name(itemMetadata, "itemMetadata");
function publicPdfFiles(data) {
  if (restricted(data)) return [];
  const files = Array.isArray(data.files) ? data.files : [];
  const publicFiles = files.filter((file) => typeof file.name === "string" && /^[^/\\]+\.pdf$/i.test(file.name) && file.private !== true && file.private !== "true");
  const originals = publicFiles.filter((file) => file.source === "original");
  return (originals.length ? originals : publicFiles).sort((left, right) => {
    const difference = volumeInfo(left.name, Number.MAX_SAFE_INTEGER).number - volumeInfo(right.name, Number.MAX_SAFE_INTEGER).number;
    return difference || left.name.localeCompare(right.name, "en", { numeric: true, sensitivity: "base" });
  }).slice(0, MAX_PDFS_PER_ITEM);
}
__name(publicPdfFiles, "publicPdfFiles");
function restricted(data) {
  return !data || data.is_dark === true || data.is_dark === "true" || data.nodownload === true || data.nodownload === "true" || data.metadata?.["access-restricted-item"] === true || data.metadata?.["access-restricted-item"] === "true";
}
__name(restricted, "restricted");
function publicMediaFiles(data, type) {
  if (restricted(data)) return [];
  const files = Array.isArray(data.files) ? data.files : [];
  const preferred = type === "AUDIO" ? ["mp3", "m4a", "ogg"] : ["mp4", "webm"];
  const publicFiles = files.filter((file) => typeof file.name === "string" && !/[\\/]/.test(file.name) && preferred.some((ext) => file.name.toLowerCase().endsWith(`.${ext}`)) && file.private !== true && file.private !== "true");
  const selectedExtension = preferred.find((ext) => publicFiles.some((file) => file.name.toLowerCase().endsWith(`.${ext}`)));
  if (!selectedExtension) return [];
  const compatible = publicFiles.filter((file) => file.name.toLowerCase().endsWith(`.${selectedExtension}`));
  const originals = compatible.filter((file) => file.source === "original");
  return (originals.length ? originals : compatible).sort((left, right) => left.name.localeCompare(right.name, "en", { numeric: true, sensitivity: "base" })).slice(0, MAX_MEDIA_FILES_PER_ITEM);
}
__name(publicMediaFiles, "publicMediaFiles");
function publicPdf(data) {
  return publicPdfFiles(data)[0] || null;
}
__name(publicPdf, "publicPdf");
function archivePdfUrl(identifier, filename) {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(filename)}`;
}
__name(archivePdfUrl, "archivePdfUrl");
function shortText(value, limit = 180) {
  const text = Array.isArray(value) ? value.find((item) => typeof item === "string") : value;
  return typeof text === "string" ? text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, limit) : "";
}
__name(shortText, "shortText");
function volumeInfo(filename, fallbackNumber) {
  const name = filename.replace(/\.pdf$/i, "").replace(/_/g, " ");
  const explicit = name.match(/\b(vol(?:ume)?|part)\s*[.\-]?\s*(\d{1,3})(?:\s*(?:and|&|[-–])\s*(\d{1,3}))?/i);
  const numbered = explicit || name.match(/(?:^|[\s.\-])(\d{1,3})(?:\s*(?:and|&|[-–])\s*(\d{1,3}))?(?=$|[\s.\-])/i);
  const first = Number(explicit?.[2] || numbered?.[1] || fallbackNumber);
  const last = explicit ? explicit[3] : numbered?.[2];
  const kind = explicit?.[1]?.toLowerCase() === "part" ? "Part" : "Volume";
  return { number: first, label: `${kind} ${first}${last ? ` and ${last}` : ""}` };
}
__name(volumeInfo, "volumeInfo");
function catalogueBook(identifier, data) {
  const mediatype = data?.metadata?.mediatype;
  const resourceType = mediatype === "texts" ? "EBOOK" : mediatype === "audio" ? "AUDIO" : mediatype === "movies" ? "VIDEO" : "";
  if (!resourceType) return null;
  const files = resourceType === "EBOOK" ? publicPdfFiles(data) : publicMediaFiles(data, resourceType);
  if (!files.length) return null;
  const title = shortText(data.metadata?.title) || identifier;
  const book = {
    id: `EXTERNAL:INTERNET_ARCHIVE:${identifier}`,
    title,
    subject: shortText(data.metadata?.subject, 80) || "Books",
    source: "Internet Archive",
    resourceType,
    details: shortText(data.metadata?.creator, 180),
    description: "From the Ummabbablibrary Archive.org list.",
    coverUrl: `https://archive.org/download/${encodeURIComponent(identifier)}/__ia_thumb.jpg`
  };
  if (resourceType !== "EBOOK") {
    book.mediaUrl = archivePdfUrl(identifier, files[0].name);
    book.mediaFiles = files.map((file, index) => ({
      number: index + 1,
      label: files.length === 1 ? title : file.name.replace(/\.[^.]+$/, "").replace(/_/g, " "),
      mediaUrl: archivePdfUrl(identifier, file.name)
    }));
    return book;
  }
  book.pdfUrl = archivePdfUrl(identifier, files[0].name);
  if (files.length > 1) {
    const info = files.map((file, index) => volumeInfo(file.name, index + 1));
    const useFileNumbers = new Set(info.map((volume) => volume.number)).size === info.length;
    book.volumes = files.map((file, index) => ({
      number: useFileNumbers ? info[index].number : index + 1,
      label: useFileNumbers ? info[index].label : `Volume ${index + 1}`,
      pdfUrl: archivePdfUrl(identifier, file.name)
    }));
  }
  return book;
}
__name(catalogueBook, "catalogueBook");
function seriesCandidate(book) {
  if (book.resourceType !== "EBOOK" || book.volumes) return null;
  const title = book.title.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const volume = title.match(/\b(?:vol(?:ume)?|part)\s*(\d{1,3})\b/i);
  if (!volume || !Number(volume[1])) return null;
  const stem = title.replace(volume[0], " ").replace(/\bcolou?r\b/gi, " ").replace(/\s+/g, " ").trim();
  const key = stem.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (key.length < 6) return null;
  const display = stem === stem.toUpperCase() ? stem.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase()) : stem;
  return { key, title: display, number: Number(volume[1]) };
}
__name(seriesCandidate, "seriesCandidate");
async function archiveCatalogue() {
  const listed = await listedIdentifiers();
  const hasIhya = listed.some((identifier) => IHYA_LIST_IDS.has(identifier));
  const identifiers = [.../* @__PURE__ */ new Set([
    ...listed,
    ...hasIhya ? IHYA_VOLUMES.map((volume) => volume.sourceId) : []
  ])];
  const byId = /* @__PURE__ */ new Map();
  let failures = 0;
  for (let index = 0; index < identifiers.length; index += 6) {
    const batch = await Promise.allSettled(identifiers.slice(index, index + 6).map(itemMetadata));
    batch.forEach((result, offset) => {
      if (result.status === "rejected") {
        failures += 1;
        return;
      }
      const book = catalogueBook(identifiers[index + offset], result.value);
      if (book) byId.set(identifiers[index + offset], book);
    });
  }
  if (failures && !byId.size && identifiers.length) {
    throw new Error("Archive.org item metadata is unavailable");
  }
  const volumes = IHYA_VOLUMES.map((volume) => {
    const book = byId.get(volume.sourceId);
    return book && { number: volume.number, pdfUrl: book.pdfUrl };
  }).filter(Boolean);
  const series = volumes.length ? {
    id: "EXTERNAL:INTERNET_ARCHIVE:IHYA_ULUM_AD_DIN_SET",
    title: "Ihya Ulum ad-Din",
    subject: "Islamic studies",
    source: "Internet Archive",
    resourceType: "EBOOK",
    details: "Imam al-Ghazali \xB7 translated by Fazl-ul-Karim",
    description: "The Revival of Religious Learnings, in separate volumes.",
    coverUrl: byId.get(IHYA_VOLUMES[0].sourceId)?.coverUrl || byId.get(IHYA_VOLUMES[1].sourceId)?.coverUrl,
    volumes
  } : null;
  const candidates = /* @__PURE__ */ new Map();
  for (const identifier of listed) {
    if (IHYA_LIST_IDS.has(identifier)) continue;
    const book = byId.get(identifier);
    const candidate = book && seriesCandidate(book);
    if (!candidate) continue;
    if (!candidates.has(candidate.key)) candidates.set(candidate.key, []);
    candidates.get(candidate.key).push({ identifier, book, candidate });
  }
  const grouped = /* @__PURE__ */ new Map();
  for (const [key, entries] of candidates) {
    if (entries.length < 2 || new Set(entries.map((entry) => entry.candidate.number)).size !== entries.length) continue;
    entries.sort((left, right) => left.candidate.number - right.candidate.number);
    const first = entries[0];
    const book = {
      id: `EXTERNAL:INTERNET_ARCHIVE:SERIES:${key.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
      title: first.candidate.title,
      subject: first.book.subject,
      source: "Internet Archive",
      resourceType: "EBOOK",
      details: first.book.details,
      description: "Volumes from the Ummabbablibrary Archive.org list.",
      coverUrl: first.book.coverUrl,
      volumes: entries.map((entry) => ({
        number: entry.candidate.number,
        label: `Volume ${entry.candidate.number}`,
        pdfUrl: entry.book.pdfUrl
      }))
    };
    for (const entry of entries) grouped.set(entry.identifier, book);
  }
  const books = [];
  let seriesAdded = false;
  const groupsAdded = /* @__PURE__ */ new Set();
  for (const identifier of listed) {
    if (IHYA_LIST_IDS.has(identifier)) {
      if (series && !seriesAdded) {
        books.push(series);
        seriesAdded = true;
      }
    } else if (grouped.has(identifier)) {
      const group = grouped.get(identifier);
      if (!groupsAdded.has(group.id)) {
        books.push(group);
        groupsAdded.add(group.id);
      }
    } else if (byId.has(identifier)) {
      books.push(byId.get(identifier));
    }
  }
  return books;
}
__name(archiveCatalogue, "archiveCatalogue");
async function isListedArchivePdfUrl(url) {
  if (url.hostname !== "archive.org" || url.search || url.hash) return false;
  const match = url.pathname.match(/^\/download\/([A-Za-z0-9_.-]+)\/([^/]+\.pdf)$/i);
  if (!match || !IDENTIFIER.test(match[1])) return false;
  let filename;
  try {
    filename = decodeURIComponent(match[2]);
  } catch (_error) {
    return false;
  }
  const identifiers = await listedIdentifiers();
  if (!identifiers.includes(match[1]) && !(IHYA_VOLUMES.some((volume) => volume.sourceId === match[1]) && identifiers.some((identifier) => IHYA_LIST_IDS.has(identifier)))) return false;
  const data = await itemMetadata(match[1]);
  const files = identifiers.includes(match[1]) ? publicPdfFiles(data) : [publicPdf(data)].filter(Boolean);
  return data.metadata?.mediatype === "texts" && files.some((file) => file.name === filename && archivePdfUrl(match[1], file.name) === url.href);
}
__name(isListedArchivePdfUrl, "isListedArchivePdfUrl");

// ../../../../../../../Users/hbnaidu/.codex/.chatgpt-projects/g-p-6ab255fb8710819189b4ee1da081d7f6/work/Academy-existing-playlist-bridge-20261104/functions/academy/open-library/catalogue.js
async function onRequestGet() {
  try {
    const books = await archiveCatalogue();
    return Response.json({ books }, {
      headers: { "Cache-Control": "public, max-age=300" }
    });
  } catch (error) {
    console.error("Archive.org list could not be loaded:", error);
    return Response.json({ error: "Archive.org books are temporarily unavailable." }, {
      status: 502,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
__name(onRequestGet, "onRequestGet");

// ../../../../../../../Users/hbnaidu/.codex/.chatgpt-projects/g-p-6ab255fb8710819189b4ee1da081d7f6/work/Academy-existing-playlist-bridge-20261104/functions/pdf-file/[encoded].js
async function onRequestGet2(context) {
  const encoded = context.params.encoded;
  if (!encoded) {
    return new Response("Missing encoded URL", { status: 400 });
  }
  let targetUrlRaw;
  try {
    targetUrlRaw = base64UrlDecode(encoded);
  } catch (err) {
    return new Response("Invalid encoded URL", { status: 400 });
  }
  let targetUrl;
  try {
    targetUrl = new URL(targetUrlRaw);
  } catch (err) {
    return new Response("Invalid target URL", { status: 400 });
  }
  if (targetUrl.protocol !== "https:") {
    return new Response("Only https URLs are allowed", { status: 400 });
  }
  const hostname = targetUrl.hostname.toLowerCase();
  const isPrivateM4LDriveUrl = isAllowedPrivateM4LDriveUrl(targetUrl);
  let isArchiveBook = false;
  if (hostname === "archive.org") {
    try {
      isArchiveBook = await isListedArchivePdfUrl(targetUrl);
    } catch (error) {
      console.error("Archive.org PDF access check failed:", error);
      return new Response("Archive.org books are temporarily unavailable", { status: 502 });
    }
  }
  const allowed = hostname.endsWith(".r2.dev") || hostname === "drive.google.com" || hostname === "docs.google.com" || hostname === "lh3.googleusercontent.com" || isPrivateM4LDriveUrl || isArchiveBook;
  if (!allowed) {
    return new Response("PDF host not allowed", { status: 403 });
  }
  targetUrl = normaliseGoogleDriveUrl(targetUrl);
  const upstreamHeaders = new Headers();
  const range = context.request.headers.get("Range");
  if (range) {
    upstreamHeaders.set("Range", range);
  }
  let upstreamResponse;
  try {
    upstreamResponse = isArchiveBook ? await fetchArchivePdf(targetUrl, upstreamHeaders) : await fetch(targetUrl.toString(), {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow"
    });
  } catch (error) {
    console.error("PDF source request failed:", error);
    return new Response("The source PDF is unavailable", { status: 502 });
  }
  if (!upstreamResponse) {
    return new Response("The source PDF is unavailable", { status: 502 });
  }
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("Set-Cookie");
  responseHeaders.set("Content-Type", "application/pdf");
  responseHeaders.set("Content-Disposition", 'inline; filename="resource.pdf"');
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set(
    "Cache-Control",
    isPrivateM4LDriveUrl || isArchiveBook ? "private, no-store, max-age=0" : "public, max-age=3600"
  );
  responseHeaders.set("Accept-Ranges", "bytes");
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders
  });
}
__name(onRequestGet2, "onRequestGet");
async function fetchArchivePdf(targetUrl, headers) {
  let url = targetUrl;
  for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
    const response = await fetch(url.toString(), { method: "GET", headers, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      if (!location) return null;
      url = new URL(location, url);
      if (url.protocol !== "https:" || url.hostname !== "archive.org" && !url.hostname.endsWith(".archive.org") || url.username || url.password) return null;
      continue;
    }
    if (response.status !== 200 && response.status !== 206) return null;
    const type = response.headers.get("Content-Type") || "";
    if (!/^(application\/pdf|application\/octet-stream)(;|$)/i.test(type)) return null;
    return response;
  }
  return null;
}
__name(fetchArchivePdf, "fetchArchivePdf");
function base64UrlDecode(input) {
  let base64 = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
__name(base64UrlDecode, "base64UrlDecode");
var PRIVATE_M4L_DRIVE_HOSTS = /* @__PURE__ */ new Set([
  "devrebootworker.maktab4life.workers.dev",
  "api.rebootyourmaktab.maktabhelper.app"
]);
function isAllowedPrivateM4LDriveUrl(url) {
  if (!url || !PRIVATE_M4L_DRIVE_HOSTS.has(url.hostname.toLowerCase())) {
    return false;
  }
  if (!/^\/api\/library\/drive\/file\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
    return false;
  }
  return !!url.searchParams.get("access");
}
__name(isAllowedPrivateM4LDriveUrl, "isAllowedPrivateM4LDriveUrl");
function normaliseGoogleDriveUrl(url) {
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "drive.google.com" && hostname !== "docs.google.com") {
    return url;
  }
  const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
  if (fileMatch && fileMatch[1]) {
    return new URL(`https://drive.google.com/uc?export=download&id=${fileMatch[1]}`);
  }
  const openId = url.searchParams.get("id");
  if (openId) {
    return new URL(`https://drive.google.com/uc?export=download&id=${openId}`);
  }
  return url;
}
__name(normaliseGoogleDriveUrl, "normaliseGoogleDriveUrl");

// ../../../../../../../Users/hbnaidu/.codex/.chatgpt-projects/g-p-6ab255fb8710819189b4ee1da081d7f6/work/Academy-existing-playlist-bridge-20261104/backend/tools/browser-site/worker.mjs
var DIRECTORIES = /* @__PURE__ */ new Set(["academy", "account", "programs", "users", "js", "css", "icons", "images", "pdf-viewer", "recorder", "activities"]);
var ROOT_ASSET = /^(?:academy|ummabbadacademy|logo)\.png$|^(?:admin|student)-(?:apple-touch-icon\.png|favicon(?:-\d+x\d+\.png|\.ico)|icon-\d+\.png|manifest\.json)$|^version\.json$/;
function assetPath(pathname) {
  let path;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (/[\\\u0000-\u001f\u007f]/.test(path) || path.split("/").some((part) => part === "." || part === ".." || part.startsWith("."))) return null;
  if (/^\/account\/[A-Za-z0-9._~-]{1,128}\/?$/.test(path)) return "/account/index.html";
  const parts = path.split("/");
  if (DIRECTORIES.has(parts[1])) {
    if (parts.length === 2 || parts.at(-1) === "") return path.replace(/\/$/, "") + "/index.html";
    return path;
  }
  return parts.length === 2 && ROOT_ASSET.test(parts[1]) ? path : null;
}
__name(assetPath, "assetPath");

// ../../../../../../../Users/hbnaidu/.codex/.chatgpt-projects/g-p-6ab255fb8710819189b4ee1da081d7f6/work/Academy-existing-playlist-bridge-20261104/backend/tools/academy-public-media.mjs
function publicPdfTarget(encoded) {
  try {
    if (!/^[A-Za-z0-9_-]{1,4096}$/.test(encoded)) return false;
    const bytes = Uint8Array.from(atob(encoded.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
    const url = new URL(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    return url.hostname === "archive.org" ? url.pathname.startsWith("/download/") && !url.search && !url.hash : ["drive.google.com", "docs.google.com", "lh3.googleusercontent.com"].includes(url.hostname);
  } catch {
    return false;
  }
}
__name(publicPdfTarget, "publicPdfTarget");

// ../../../../../../../Users/hbnaidu/.codex/.chatgpt-projects/g-p-6ab255fb8710819189b4ee1da081d7f6/work/Academy-existing-playlist-bridge-20261104/backend/tools/academy-circles-routes.mjs
var circlesOrigin = "https://maktab4life.org";
var academyCirclesPages = /* @__PURE__ */ new Set([
  "academy/index.html",
  "academy/admin/index.html",
  "academy/calendar/index.html",
  "academy/course-companion/surah-kahf/index.html",
  "academy/course-websites/index.html",
  "academy/course-websites/public/index.html",
  "academy/course-websites/view/index.html",
  "academy/courses/manage/index.html",
  "academy/enrolment/index.html",
  "academy/enrolment/manage/index.html",
  "academy/hifz/index.html",
  "academy/library/index.html",
  "academy/library/manage/index.html",
  "academy/media/index.html",
  "academy/monthly-media/index.html",
  "academy/pdf-compare/index.html",
  "academy/pdf-reader/index.html",
  "academy/pdf-tools/index.html",
  "academy/subjects/index.html",
  "academy/website-platform/connect/index.html",
  "academy/website-studio/connect/index.html",
  "academy/website-studio/session/index.html",
  "account/index.html",
  "activities/kaaba-puzzle/index.html",
  "activities/surahs-in-my-heart/index.html",
  "pdf-viewer/web/viewer.html",
  "programs/attendance.html",
  "programs/index.html",
  "recorder/index.html",
  "users/index.html"
]);
var academyCirclesFragments = /* @__PURE__ */ new Set([
  "programs/fragments/timetable.fragment",
  "programs/fragments/participants.fragment",
  "programs/fragments/lesson-media.fragment"
]);
var academyRetiredPages = /* @__PURE__ */ new Set([
  "academy/pdf-icon-samples/index.html",
  "academy/website-platform/handover/index.html",
  "academy/teaching/index.html",
  "academy/open-library/index.html",
  "programs/timetable.html",
  "programs/manage.html",
  "programs/lesson-media.html",
  "programs/library-view.html",
  "programs/library.html",
  "programs/media.html"
]);
var programAliases = /* @__PURE__ */ new Map([["/programs/timetable.html", "timetable"], ["/programs/manage.html", "participants"], ["/programs/lesson-media.html", "media"]]);
var timetableTabs = /* @__PURE__ */ new Set(["curriculum", "classes", "public-card", "timetable", "review"]);
function academyCirclesAlias(url, path) {
  if (url.pathname === "/" || url.pathname === "/index.html") return circlesOrigin + "/";
  if (/^\/(?:admin|student)(?:\/|\.html$|$)/.test(url.pathname)) {
    const next = new URL(url.pathname.startsWith("/admin") ? "/academy/admin/" : "/academy/", url.origin);
    next.search = url.search;
    return next.href;
  }
  if (programAliases.has(path)) {
    const next = new URL("/programs/", url.origin);
    next.search = url.search;
    const tab = programAliases.get(path);
    if (tab !== "timetable" || !timetableTabs.has(next.searchParams.get("tab"))) next.searchParams.set("tab", tab);
    return next.href;
  }
  if (path === "/academy/open-library/index.html") {
    const next = new URL("/academy/library/", url.origin);
    next.search = url.search;
    next.searchParams.set("view", "public");
    return next.href;
  }
  const fixed = /* @__PURE__ */ new Map([
    ["/academy/teaching/index.html", "/academy/calendar/"],
    ["/programs/library-view.html", "/academy/library/"],
    ["/programs/library.html", "/academy/library/"],
    ["/programs/media.html", "/academy/media/"]
  ]);
  if (fixed.has(path)) {
    const next = new URL(fixed.get(path), url.origin);
    next.search = url.search;
    return next.href;
  }
  return null;
}
__name(academyCirclesAlias, "academyCirclesAlias");
function circlesPageUnavailable(method = "GET") {
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Page unavailable \xB7 Umm Abbad Academy</title><style>body{margin:0;background:#faf7f2;color:#554653;font:1rem system-ui,sans-serif}main{max-width:42rem;margin:12vh auto;padding:2rem}h1{font:2.3rem Georgia,serif}a{display:inline-block;padding:.8rem 1.2rem;border:1px solid #bdacb8;border-radius:1rem;color:inherit}</style></head><body><main><p>Umm Abbad Academy</p><h1>This page is no longer available</h1><p>Open your dashboard to continue with your current account.</p><a href="https://maktab4life.org/">Open Academy</a></main></body></html>';
  return new Response(method === "HEAD" ? null : html, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" } });
}
__name(circlesPageUnavailable, "circlesPageUnavailable");

// ../../../../../../../Users/hbnaidu/.codex/.chatgpt-projects/g-p-6ab255fb8710819189b4ee1da081d7f6/work/Academy-existing-playlist-bridge-20261104/backend/tools/academy-site.mjs
var siteVersion = "109.17";
var siteBranch = "development";
async function serveAcademySite(request, env, { pages = false, branch = siteBranch, syntheticOnly = false } = {}) {
  const url = new URL(request.url);
  if (["/api/feature-preview/health", "/api/site/health"].includes(url.pathname)) return Response.json({ success: true, version: siteVersion, branch, syntheticOnly }, { headers: { "Cache-Control": "no-store" } });
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
  if (/^\/_assets\/[a-f0-9]{64}\//.test(url.pathname)) {
    if (!/^\/_assets\/[a-f0-9]{64}\/[-A-Za-z0-9_./]+\.(?:js|mjs|css|png|jpe?g|svg|webp|gif|ico|woff2?|ttf|otf|bcmap|pfb|wasm|json|webmanifest|map|ftl|txt|md|pdf|properties|bin)$/.test(url.pathname) || url.pathname.split("/").some((p) => p.startsWith("."))) return new Response("Not found", { status: 404 });
    const result = await env.ASSETS.fetch(request), headers2 = new Headers(result.headers);
    if (result.ok && headers2.get("Content-Type")?.includes("text/html")) return new Response("Not found", { status: 404 });
    if (result.ok && !headers2.get("Content-Type")?.includes("text/html")) headers2.set("Cache-Control", "public, max-age=31536000, immutable");
    headers2.set("X-Content-Type-Options", "nosniff");
    headers2.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(request.method === "HEAD" ? null : result.body, { status: result.status, headers: headers2 });
  }
  let path = assetPath(url.pathname), shortDirectory = false;
  if (path && !path.split("/").at(-1).includes(".") && (academyCirclesPages.has(path.slice(1) + "/index.html") || academyRetiredPages.has(path.slice(1) + "/index.html"))) {
    path += "/index.html";
    shortDirectory = true;
  }
  if (path?.endsWith("/index.html") && url.pathname === path.slice(0, -11)) shortDirectory = true;
  const alias = academyCirclesAlias(url, path);
  if (alias) return new Response(null, { status: 302, headers: { Location: alias, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  if (shortDirectory) {
    const next = new URL(url);
    next.pathname += "/";
    return new Response(null, { status: 302, headers: { Location: next.href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  if (url.pathname === "/academy/open-library/catalogue") return onRequestGet();
  if (url.pathname.startsWith("/pdf-file/")) {
    const encoded = url.pathname.slice("/pdf-file/".length);
    if (!publicPdfTarget(encoded)) return new Response("Public PDF source required", { status: 403 });
    return onRequestGet2({ request, params: { encoded } });
  }
  if (!path) return url.pathname.split("/").at(-1).includes(".") ? new Response("Not found", { status: 404 }) : circlesPageUnavailable(request.method);
  const file = path.slice(1), document = path.endsWith(".html") || !path.split("/").at(-1).includes(".");
  if (document && !academyCirclesPages.has(file)) return circlesPageUnavailable(request.method);
  if (path.endsWith(".fragment") && !academyCirclesFragments.has(file)) return circlesPageUnavailable(request.method);
  url.pathname = pages && path.endsWith("/index.html") ? path.slice(0, -10) : path;
  const response = await env.ASSETS.fetch(new Request(url, request));
  if (document && response.status === 404) return circlesPageUnavailable(request.method);
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("X-Content-Type-Options", "nosniff");
  if (document) headers.set("Cache-Control", "no-store");
  if (academyCirclesFragments.has(file)) {
    headers.set("Content-Type", "text/plain; charset=utf-8");
    headers.set("Cache-Control", "no-cache");
  }
  return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, headers });
}
__name(serveAcademySite, "serveAcademySite");

// development-pages-worker.mjs
var development_pages_worker_default = { fetch: /* @__PURE__ */ __name((request, env) => serveAcademySite(request, env, { "pages": true, "branch": "studio_dev", "syntheticOnly": false }), "fetch") };
export {
  development_pages_worker_default as default
};
//# sourceMappingURL=development-pages-worker.js.map
