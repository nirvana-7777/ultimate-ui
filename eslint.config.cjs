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

        // Third-party libraries
        FuzzySet: "readonly", // Added for epg_mapping_fuzzy.js
        shaka: "readonly",    // Added for epg_player.js (Shaka Player library)

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
        CONFIG_DATA: "readonly",
        epgMappingManager: "readonly", // Added for epg_mapping_ui.js

        // EPG related globals
        EPGCore: "readonly",
        EPGUI: "readonly",
        EPGPlayer: "readonly"
      }
    },

    rules: {
      "no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }],
      "no-undef": "error",
      "no-console": "off"
    }
  }
];

