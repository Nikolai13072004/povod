export const validatePassword = (password: string) => {
  if (!password) {
    return {
      isValid: false,
      message: "Пароль не может быть пустым",
    };
  }

  if (password.length < 8) {
    return {
      isValid: false,
      message: "Пароль должен содержать минимум 8 символов",
    };
  }

  // const hasNumber = /\d/.test(password);
  // if (!hasNumber) return { isValid: false, message: "Нужна хотя бы одна цифра" };

  return {
    isValid: true,
    message: "",
  };
};
