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

        // File and URL APIs
        Blob: "readonly",
        URL: "readonly",
        FileReader: "readonly",
        File: "readonly",

        // Web APIs
        IntersectionObserver: "readonly",
        Intl: "readonly",
        URLSearchParams: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        AbortController: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",

        // Browser objects
        location: "readonly",
        sessionStorage: "readonly",
        localStorage: "readonly",
        history: "readonly",
        navigator: "readonly",

        // Your custom globals
        showToast: "readonly",
        showLoading: "readonly",
        hideLoading: "readonly",
        epgDisplayManager: "readonly",
        monitoringManager: "readonly",
        baseTemplate: "readonly",
        CONFIG_DATA: "readonly", // From config.js

        // EPG related globals
        EPGCore: "readonly", // Defined in epg_core.js
        EPGUI: "readonly",   // Defined elsewhere (probably epg_ui.js)
        EPGPlayer: "readonly" // Defined elsewhere
      }
    },

    rules: {
      "no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_",
        "varsIgnorePattern": "^_" // Allow unused variables starting with _
      }],
      "no-undef": "error",
      "no-console": "off"
    }
  }
];

