export const buildSessionConfig = () => {
  return {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      secure: "auto",
      sameSite: "lax",
    },
  };
};
