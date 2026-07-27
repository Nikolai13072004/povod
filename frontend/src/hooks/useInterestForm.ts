import { useState, useCallback } from "react";

export const useInterestForm = () => {
  const [peopleFrom, setPeopleFrom] = useState<string>("2");
  const [peopleTo, setPeopleTo] = useState<string>("100");

  const validateAndSet = useCallback((value: string, setter: (v: string) => void) => {
    if (value === "") {
      setter("");
      return;
    }

    const num = parseInt(value, 10);

    if (isNaN(num)) return;

    if (num < 1) return;
    if (num > 100) {
      setter("100");
    } else {
      setter(num.toString());
    }
  }, []);

  const handleBlur = (value: string, setter: (v: string) => void) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 2) {
      setter("2");
    }
  };

  return {
    peopleFrom,
    setPeopleFrom: (val: string) => validateAndSet(val, setPeopleFrom),
    peopleTo,
    setPeopleTo: (val: string) => validateAndSet(val, setPeopleTo),
    handleBlurFrom: () => handleBlur(peopleFrom, setPeopleFrom),
    handleBlurTo: () => handleBlur(peopleTo, setPeopleTo),
    isValid:
      parseInt(peopleFrom) >= 2 &&
      parseInt(peopleTo) <= 100 &&
      parseInt(peopleFrom) <= parseInt(peopleTo),
  };
};
