export const validateDate = (date: string): boolean => {
  const dateRegex = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/;
  const match = date.match(dateRegex);

  if (!match) return false;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day > 0 && day <= daysInMonth;
};
export const validateTime = (time: string): boolean => {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
};
export const validateLocation = (location: string): boolean => {
  const locRegex = /^[a-zA-Zа-яА-ЯёЁ\s-]{2,50}$/;
  return locRegex.test(location.trim());
};
