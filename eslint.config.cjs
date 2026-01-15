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

        // DOM APIs
        HTMLElement: "readonly", // Added for main.js
        getComputedStyle: "readonly", // Added for monitoring.js

        // Third-party libraries
        FuzzySet: "readonly",
        shaka: "readonly",

        // Browser objects
        location: "readonly",
        sessionStorage: "readonly",
        localStorage: "readonly",
        history: "readonly",
        navigator: "readonly",
        caches: "readonly",

        // Service Worker API
        serviceWorker: "readonly",

        // Your custom globals
        showToast: "readonly",
        showLoading: "readonly",
        hideLoading: "readonly",
        epgDisplayManager: "readonly",
        monitoringManager: "readonly",
        baseTemplate: "readonly",
        CONFIG_DATA: "readonly",
        epgMappingManager: "readonly",
        MONITORING_DATA: "readonly", // Added for monitoring.js

        // EPG related globals
        EPGCore: "readonly",
        EPGUI: "readonly",
        EPGPlayer: "readonly",
        EPGUIMain: "readonly" // Added for EPGUI.js
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

