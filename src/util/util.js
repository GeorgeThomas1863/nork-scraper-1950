import dbModel from "../../models/db-model.js";
import kcnaState from "./state.js";
import { articleURLs, picSetURLs } from "./define-things.js";

export const calcHowMuchKCNA = async (howMuch, type) => {
  if (!howMuch || !type) return null;

  let defaultURLs = articleURLs;
  if (type === "picSets") defaultURLs = picSetURLs;

  const dataArray = [];
  for (const typeKey in defaultURLs) {
    if (!kcnaState.scrapeActive) return dataArray;

    const pageURLs = defaultURLs[typeKey];
    if (!pageURLs || !pageURLs.length) continue;
    let itemLength = pageURLs.length;
    if (howMuch === "admin-scrape-new" && itemLength > 2) itemLength = 2;

    const pageArray = pageURLs.slice(pageURLs.length - itemLength);

    const returnObj = {
      typeKey: typeKey,
      pageArray: pageArray,
    };

    dataArray.push(returnObj);
  }

  return dataArray;
};

//---------------------

export const buildNumericId = async (itemType) => {
  if (!itemType) return null;
  const prefix = itemType.slice(0, -1);
  const idKey = `${prefix}Id`;
  return new dbModel({ idKey }, itemType).nextId();
};

//-------------------------------

export const extractItemDate = (linkElement) => {
  const { scrapeStartTime } = kcnaState;
  if (!linkElement) return null;

  const dateElement = linkElement.querySelector(".publish-time");
  if (!dateElement) return null;

  const dateRaw = dateElement.textContent.trim();
  if (!dateRaw) return null;
  const dateText = dateRaw.replace(/[\[\]]/g, "");

  const dateArr = dateText.split(".");
  const year = parseInt(dateArr[0]);
  const month = parseInt(dateArr[1]);
  const day = parseInt(dateArr[2]);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const normalDate = new Date(year, month - 1, day);

  if (!scrapeStartTime) return normalDate;

  const scrapeHour = scrapeStartTime.getHours();
  const scrapeMinute = scrapeStartTime.getMinutes();

  normalDate.setHours(scrapeHour);
  normalDate.setMinutes(scrapeMinute);

  return normalDate;
};

//-----------------

export const sortArrayByDate = (inputArray, itemType = "articles") => {
  if (!inputArray || !inputArray.length) return null;

  if (!kcnaState.scrapeActive) return null;

  const prefix = itemType.slice(0, -1);
  const typeKey = `${prefix}Id`;

  const sortArray = [...inputArray];

  sortArray.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);

    const dateCompare = dateA - dateB;

    if (dateCompare === 0) return a[typeKey] - b[typeKey];

    return dateCompare;
  });

  return sortArray;
};

export const normalizeInputsTG = (url, date) => {
  if (!url || !date) return null;

  const urlNormal = normalizeURL(url);
  const dateNormal = normalizeDate(date);

  return { urlNormal, dateNormal };
};

export const normalizeURL = (url) => {
  if (!url) return null;
  return url.replace(/\./g, "[.]").replace(/:/g, "[:]").replace(/\?/g, "[?]");
};

export const normalizeDate = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
};
