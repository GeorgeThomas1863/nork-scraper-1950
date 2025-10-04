//helper functions
import dbModel from "../../models/db-model.js";
import { kcnaState } from "./kcna-control.js";

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
  const params = { keyToLookup: "url", itemValue: url };
  const lookupModel = new dbModel(params, collection);
  const lookupData = await lookupModel.getUniqueItem();
  return lookupData?.date;
};

export const getNextId = async (keyToLookup, collection) => {
  const dataModel = new dbModel({ keyToLookup: keyToLookup }, collection);
  const maxId = await dataModel.findMaxId();

  if (!maxId) return 1;

  return maxId + 1;
};

export const getIdFromURL = async (url) => {
  const dotIndex = url.lastIndexOf(".kcmsf");
  const id = url.substring(dotIndex - 7, dotIndex);
  return id;
};
