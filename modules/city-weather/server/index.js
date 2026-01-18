
module.exports = class CityWeatherModule {
    constructor() {
        this.metadata = {
            name: "city-weather",
            version: "2.0.0",
            description: "Shanghai Weather and Global Search",
            dependencies: {},
            ui: {
                sidebar: {
                    label: "城市天气",
                    href: "/admin/modules/city-weather",
                    icon: "CloudRain"
                }
            }
        };
    }

    async init(context) {
        this.context = context;
        const gateway = context.gateway;

        // Register API Route: GET /city-weather/query?city=xxx
        gateway.registerRoute({
            method: "GET",
            path: "/api/v1/city-weather/query",
            moduleName: this.metadata.name,
            handler: this.handleGetWeather.bind(this)
        });

        console.log("[CityWeather] Initialized!");
    }

    async handleGetWeather(req) {
        // req is the gateway request context, containing parsed query params
        const city = req.query?.city || "shanghai";

        try {
            const encodedCity = encodeURIComponent(city);
            console.log(`[CityWeather] Fetching data for ${city} (url: .../${encodedCity})...`);
            const res = await fetch(`https://goweather.xyz/v2/weather/${encodedCity}`);

            if (!res.ok) {
                if (res.status === 404) {
                    throw new Error("未找到该城市，请尝试使用英文或拼音 (例如: 'Beijing')");
                }
                console.warn(`[CityWeather] Upstream API failed (${res.status}).`);
                throw new Error(`Upstream API failed: ${res.status}`);
            }

            const data = await res.json();
            return {
                status: 200,
                headers: { "Content-Type": "application/json" },
                body: data
            };
        } catch (error) {
            console.error("[CityWeather] Fetch error:", error);
            // User requested NO MOCK data. Return actual error.
            return {
                status: 502, // Bad Gateway
                headers: { "Content-Type": "application/json" },
                body: {
                    error: "Failed to fetch weather data from upstream",
                    details: error.message
                }
            };
        }
    }

    async destroy() {
        console.log("[CityWeather] Destroyed.");
    }
};
