const { useState, useEffect } = React;
// LucideIcons is injected into the scope by ModuleFrame
const icons = (typeof LucideIcons !== 'undefined' ? LucideIcons : window.LucideIcons) || {};
// Safe destructure with defaults
const SafeIcon = (name) => icons[name] || (() => null);
const SearchIcon = SafeIcon("Search");
const MapPinIcon = SafeIcon("MapPin");
const CloudRainIcon = SafeIcon("CloudRain");
const WindIcon = SafeIcon("Wind");
const ThermometerIcon = SafeIcon("Thermometer");
const CalendarIcon = SafeIcon("Calendar");

function CityWeather({ locale = "zh" }) {
    const [city, setCity] = useState("shanghai");
    const [query, setQuery] = useState("");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [t, setT] = useState({});
    const [langLoading, setLangLoading] = useState(true);

    // Load translations
    useEffect(() => {
        const loadTranslations = async () => {
            // Fallback to zh if locale is missing
            const targetLocale = locale || "zh";
            try {
                const res = await fetch(`/api/v1/modules/city-weather/assets/locales/${targetLocale}.json`);
                if (res.ok) {
                    const json = await res.json();
                    setT(json);
                } else {
                    console.warn("Failed to load translations for", targetLocale);
                }
            } catch (e) {
                console.error("Translation load error", e);
            } finally {
                setLangLoading(false);
            }
        };
        loadTranslations();
    }, [locale]);

    const fetchWeather = async (targetCity) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/v1/gateway/api/v1/city-weather/query?city=${targetCity}`);
            if (!res.ok) throw new Error("API Error: " + res.status);
            const json = await res.json();
            if (!json.temperature && !json.forecast) throw new Error(t.error_not_found || "City not found");
            setData(json);
            setCity(targetCity);
        } catch (e) {
            setError(e.message);
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    // Auto-locate on mount
    useEffect(() => {
        // Wait for translations? Or just run.
        // It's better to verify user location.
        getUserLocation();
    }, []); // eslint-disable-line

    const handleSearch = (e) => {
        e.preventDefault();
        if (!query.trim()) return;
        fetchWeather(query.trim());
    };

    const getUserLocation = () => {
        // Don't set loading for seamless init, or maybe yes.
        // setLoading(true); 
        if (!navigator.geolocation) {
            // alert(t.error_geo_unsupported);
            return;
        }

        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude, longitude } = pos.coords;
            try {
                const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&accept-language=en`);
                const geoData = await geoRes.json();
                const address = geoData.address || {};
                const locatedCity = address.city || address.town || address.county || address.state || "Shanghai";
                const cleanCity = locatedCity.split(" ")[0].replace(/[^a-zA-Z]/g, '');
                console.log(`[CityWeather] Located: ${latitude},${longitude} -> ${locatedCity} -> ${cleanCity}`);
                fetchWeather(cleanCity);
            } catch (e) {
                console.error("Reverse geocoding failed", e);
                // alert(t.warn_geo_city_parse);
                fetchWeather("Beijing");
            }
        }, (err) => {
            console.warn(err);
            // alert(t.error_geo_failed + err.message);
        });
    };

    if (langLoading) return React.createElement("div", { className: "p-6 flex items-center justify-center" }, "Loading...");

    return React.createElement("div", { className: "p-6 flex flex-col gap-6 h-full max-w-4xl mx-auto" },
        // Header & Search
        React.createElement("div", { className: "flex flex-col gap-4" },
            React.createElement("div", { className: "flex justify-between items-center" },
                React.createElement("h1", { className: "text-2xl font-bold flex items-center gap-2" },
                    React.createElement(CloudRainIcon, { className: "w-6 h-6 text-primary" }),
                    t.title || "City Weather"
                ),
                React.createElement("span", { className: "text-xs px-2 py-1 bg-muted rounded font-mono text-muted-foreground" }, "Ext v2.1")
            ),
            React.createElement("form", { onSubmit: handleSearch, className: "flex gap-2" },
                React.createElement("div", { className: "relative flex-1" },
                    React.createElement(SearchIcon, { className: "absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" }),
                    React.createElement("input", {
                        type: "text",
                        value: query,
                        onChange: (e) => setQuery(e.target.value),
                        placeholder: t.placeholder || "Enter city...",
                        className: "w-full pl-9 pr-4 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    })
                ),
                React.createElement("button", {
                    type: "submit",
                    disabled: loading,
                    className: "px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                }, t.search || "Search"),
                React.createElement("button", {
                    type: "button",
                    onClick: getUserLocation,
                    title: t.auto_locate || "Auto Locate",
                    className: "px-3 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                }, React.createElement(MapPinIcon, { className: "w-4 h-4" }))
            )
        ),

        // Content Area
        loading && React.createElement("div", { className: "flex-1 flex items-center justify-center text-muted-foreground flex-col gap-2" },
            React.createElement("div", { className: "w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" }),
            t.loading || "Loading..."
        ),

        error && !loading && React.createElement("div", { className: "p-4 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2" },
            (t.error_prefix || "Error: ") + error
        ),

        data && !loading && React.createElement("div", { className: "flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500" },
            // Current Weather Card
            React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4" },
                React.createElement("div", { className: "bg-card text-card-foreground border rounded-xl p-6 shadow-sm flex flex-col justify-between" },
                    React.createElement("div", { className: "flex justify-between items-start" },
                        React.createElement("div", { className: "flex flex-col" },
                            React.createElement("span", { className: "text-4xl font-bold tracking-tighter" }, data.temperature),
                            React.createElement("span", { className: "text-muted-foreground mt-1 capitalize font-medium" }, data.description),
                            React.createElement("span", { className: "text-xs text-muted-foreground mt-4 flex items-center gap-1" },
                                React.createElement(MapPinIcon, { className: "w-3 h-3" }),
                                city.toUpperCase()
                            )
                        ),
                        React.createElement("div", { className: "bg-primary/10 p-3 rounded-full" },
                            React.createElement(ThermometerIcon, { className: "w-8 h-8 text-primary" })
                        )
                    )
                ),
                React.createElement("div", { className: "bg-card text-card-foreground border rounded-xl p-6 shadow-sm flex flex-col justify-between" },
                    React.createElement("div", { className: "flex justify-between items-start" },
                        React.createElement("div", { className: "flex flex-col gap-2" },
                            React.createElement("span", { className: "text-sm text-muted-foreground font-medium uppercase" }, t.wind_status || "Wind Status"),
                            React.createElement("span", { className: "text-2xl font-bold" }, data.wind),
                        ),
                        React.createElement("div", { className: "bg-blue-500/10 p-3 rounded-full" },
                            React.createElement(WindIcon, { className: "w-8 h-8 text-blue-500" })
                        )
                    )
                )
            ),

            // Forecast List
            data.forecast && data.forecast.length > 0 && React.createElement("div", { className: "space-y-3" },
                React.createElement("h3", { className: "text-sm font-semibold text-muted-foreground flex items-center gap-2" },
                    React.createElement(CalendarIcon, { className: "w-4 h-4" }),
                    t.forecast || "Forecast"
                ),
                React.createElement("div", { className: "grid grid-cols-3 gap-3" },
                    data.forecast.map((day, idx) =>
                        React.createElement("div", { key: idx, className: "bg-muted/30 border rounded-lg p-4 flex flex-col items-center gap-1 hover:bg-muted/50 transition-colors" },
                            React.createElement("span", { className: "text-xs font-bold bg-background px-2 py-0.5 rounded border" }, (t.day || "Day {day}").replace("{day}", day.day)),
                            React.createElement("span", { className: "text-lg font-bold mt-1" }, day.temperature),
                            React.createElement("span", { className: "text-xs text-muted-foreground" }, day.wind)
                        )
                    )
                )
            )
        )
    );
}

exports.default = CityWeather;
