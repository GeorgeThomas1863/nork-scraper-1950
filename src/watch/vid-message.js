export const buildVidTitleText = (inputObj) => {
  if (!inputObj) return null;
  const { title, dateNormal, vidType, vidPageId, urlNormal } = inputObj;
  if (!title) return null;

  const safeTitle = escapeTelegramHTML(title);
  const safeDate = escapeTelegramHTML(dateNormal);
  const safeType = escapeTelegramHTML(vidType);
  const safeId = escapeTelegramHTML(vidPageId);
  const safeURL = escapeTelegramHTML(urlNormal);

  const titleText = `🇰🇵 🇰🇵 🇰🇵

-----------------

<b>${safeTitle}</b>

-----------------

<b>KCTV VIDEO:</b> ${safeType} | <b>ID:</b> ${safeId} | <b>DATE:</b> <i>${safeDate}</i> | <b>URL:</b>
<i>${safeURL}</i>
  `;

  return titleText;
};

export const buildVidCaptionText = (inputObj, partIndex, partCount) => {
  if (!inputObj) return null;
  const { title, dateNormal } = inputObj;
  if (!title) return null;

  const safeTitle = escapeTelegramHTML(title);
  const safeDate = escapeTelegramHTML(dateNormal);

  const isMultiPart = isPositiveInteger(partCount) && partCount > 1;
  const partSuffix = isMultiPart ? ` | Part ${partIndex} of ${partCount}` : "";

  let caption = `<b>${safeTitle}</b>\n<i>${safeDate}</i>${partSuffix}`;

  return truncateCaption(caption, partSuffix, safeDate);
};

const isPositiveInteger = (value) => {
  return Number.isInteger(value) && value > 0;
};

const truncateCaption = (caption, partSuffix, safeDate) => {
  const maxLength = 1024;
  if (caption.length <= maxLength) return caption;

  const baseCaption = `<b></b>\n<i>${safeDate}</i>${partSuffix}`;
  const maxTitleLength = maxLength - baseCaption.length;

  if (maxTitleLength <= 0) return caption.slice(0, maxLength);

  const titleStart = caption.indexOf("<b>") + 3;
  const titleEnd = caption.indexOf("</b>");
  const truncatedTitle = caption.slice(titleStart, titleEnd).slice(0, maxTitleLength);

  return `<b>${truncatedTitle}</b>\n<i>${safeDate}</i>${partSuffix}`;
};

const escapeTelegramHTML = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
};
