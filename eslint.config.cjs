module.exports = [
  {
    files: ["src/static/js/**/*.js"],
    ignores: ["node_modules/**"],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        confirm: "readonly",
        alert: "readonly",

        // Add any other browser-specific globals you use
        location: "readonly",
        sessionStorage: "readonly",
        localStorage: "readonly",
        history: "readonly",
        navigator: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",

        // Your custom globals
        showToast: "readonly",
        showLoading: "readonly",
        hideLoading: "readonly",
        epgDisplayManager: "readonly",
        monitoringManager: "readonly",
        baseTemplate: "readonly"
      }
    },

    rules: {
      "no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }],
      "no-undef": "error",
      "no-console": "off"
    }
  }
];

