//helper functions
import dbModel from "../../../models/db-model.js";
import kcnaState from "./state.js";

export const extractItemDate = async (linkElement) => {
  const { scrapeStartTime } = kcnaState;
  if (!linkElement) return null;

  const dateElement = linkElement.querySelector(".publish-time");
  if (!dateElement) return null;

  //extract dateText
  const dateRaw = dateElement.textContent.trim();
  if (!dateRaw) return null;
  const dateText = dateRaw.replace(/[\[\]]/g, "");

  // Convert the date string (YYYY.MM.DD) to a JavaScript Date object, then split to arr
  const dateArr = dateText.split(".");
  const year = parseInt(dateArr[0]);
  // JS months are 0-based (subtract 1 at end)
  const month = parseInt(dateArr[1]);
  const day = parseInt(dateArr[2]);

  // Validate the date; if fucked return null
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const normalDate = new Date(year, month - 1, day);

  //if no startTime return just date
  if (!scrapeStartTime) return normalDate;

  const scrapeHour = scrapeStartTime.getHours();
  const scrapeMinute = scrapeStartTime.getMinutes();

  normalDate.setHours(scrapeHour);
  normalDate.setMinutes(scrapeMinute);

  return normalDate;
};

export const lookupItemDate = async (url, collection) => {
  if (!url) return null;
  try {
    const params = { keyToLookup: "url", itemValue: url };
    const lookupModel = new dbModel(params, collection);
    const lookupData = await lookupModel.getUniqueItem();
    return lookupData?.date;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

export const sortArrayByDate = async (inputArray, itemType = "articles") => {
  if (!inputArray || !inputArray.length) return null;

  if (!kcnaState.scrapeActive) return null;

  const prefix = itemType.slice(0, -1);
  const typeKey = `${prefix}Id`;

  // Create a copy of the array to avoid modifying the original
  const sortArray = [...inputArray];

  //sort input array by DATE OLDEST to NEWEST
  sortArray.sort((a, b) => {
    // Convert datetime strings to Date objects if needed
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);

    const dateCompare = dateA - dateB;

    if (dateCompare === 0) return a[typeKey] - b[typeKey];

    return dateCompare;
  });

  return sortArray;
};

export const buildNumericId = async (itemType) => {
  if (!itemType) return null;

  const prefix = itemType.slice(0, -1);
  const keyToLookup = `${prefix}Id`;

  const nextId = await getNextId(keyToLookup, itemType);
  return nextId;
};

export const getNextId = async (keyToLookup, collection) => {
  try {
    const dataModel = new dbModel({ keyToLookup: keyToLookup }, collection);
    const maxId = await dataModel.findMaxId();

    if (!maxId) return 1;

    return maxId + 1;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

export const getIdFromURL = async (url) => {
  const dotIndex = url.lastIndexOf(".kcmsf");
  const id = url.substring(dotIndex - 7, dotIndex);
  return id;
};

export const normalizeTGInputs = async (url, date) => {
  if (!url || !date) return null;

  const urlNormal = await normalizeURL(url);
  const dateNormal = await normalizeDate(date);

  const returnObj = {
    urlNormal: urlNormal,
    dateNormal: dateNormal,
  };

  return returnObj;
};

export const normalizeURL = async (url) => {
  if (!url) return null;
  return url.replace(/\./g, "[.]").replace(/:/g, "[:]").replace(/\?/g, "[?]");
};

export const normalizeDate = async (date) => {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
};
