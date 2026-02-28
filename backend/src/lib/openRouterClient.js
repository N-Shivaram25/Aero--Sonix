import { OpenRouter } from "@openrouter/sdk";

export const getOpenRouterClient = () => {
    const apiKey = process.env.OPEN_ROUTER_API_KEY;
    if (!apiKey) {
        throw new Error("OPEN_ROUTER_API_KEY is not set");
    }

    return new OpenRouter({
        apiKey,
    });
};
