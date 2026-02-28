import { SarvamAIClient } from "sarvamai";

export const getSarvamAIClient = () => {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
        throw new Error("SARVAM_API_KEY is not set");
    }

    return new SarvamAIClient({
        apiSubscriptionKey: apiKey,
    });
};
