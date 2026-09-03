export type ConditionCampaign = {
  name: string;
  headline: string;
  intro: string;
  symptoms: string[];
  context: string[];
  questions: string[];
  experiment: string;
  caution: string;
  title: string;
  description: string;
};

export const conditionCampaigns: Record<string, ConditionCampaign> = {
  ms: {
    name: "Multiple Sclerosis",
    headline: "Your MS experience. A clearer personal history.",
    intro: "Bring symptoms, everyday routines, and the information you choose to track into one place. AXVital helps you explore patterns in your own history—not predict what MS will do next.",
    symptoms: ["Fatigue and energy", "Mobility and pain", "Numbness or tingling", "Cognitive symptoms", "Episodes or symptom changes"],
    context: ["Sleep and stress", "Exercise and nutrition", "Hydration and supplements", "Medication timing", "Temperature and environment"],
    questions: ["Does sleep duration appear related to my next-day fatigue?", "Does exercise frequency appear associated with my energy?", "What routines or circumstances were recorded around symptom changes?"],
    experiment: "If I follow a consistent bedtime routine, does my next-day fatigue score change?",
    caution: "AXVital cannot diagnose a relapse or predict MS progression. Discuss new or changing symptoms and treatment decisions with your healthcare professional.",
    title: "MS Symptom Tracking & Personal Health Insights | AXVital",
    description: "Organize MS symptoms, daily routines, and personal tracking questions with AXVital. Explore patterns in your own data and bring context to healthcare conversations.",
  },
  psoriasis: {
    name: "Psoriasis",
    headline: "Put your psoriasis tracking in context.",
    intro: "Keep a personal record of flares, skin discomfort, and everyday life. AXVital helps you see what changed over time and organize the questions you want to explore.",
    symptoms: ["Flare occurrence and severity", "Skin discomfort", "Affected areas in your notes", "Episode duration", "Symptom changes over time"],
    context: ["Sleep and stress", "Nutrition and alcohol", "Exercise and hydration", "Existing treatments and supplements", "Environmental factors"],
    questions: ["Do changes in my recorded flares follow changes in sleep or stress?", "Are there foods or routines I want to investigate in my own history?", "Does consistency with my existing treatment routine appear associated with my tracked symptoms?"],
    experiment: "If I make time for a consistent evening wind-down routine, does my recorded skin discomfort change?",
    caution: "Tracking does not show that a food, supplement, or lifestyle change treats psoriasis. Continue care with your healthcare professional; do not change treatment based on a tracking pattern alone.",
    title: "Psoriasis Tracking & Personal Health Insights | AXVital",
    description: "Track psoriasis flares, skin discomfort, and daily routines in one personal history. Explore trends and structured questions with AXVital.",
  },
  hsv: {
    name: "HSV",
    headline: "Understand the history around your HSV episodes.",
    intro: "Record episodes and everyday context at your own pace, without judgment. AXVital helps you organize what happened, when it happened, and the patterns you want to explore.",
    symptoms: ["Episode occurrence", "Episode duration", "Symptom severity", "Changes between episodes", "Notes you choose to keep"],
    context: ["Sleep and stress", "Illness and travel", "Exercise and nutrition", "Alcohol, medications, and supplements", "Other personal circumstances"],
    questions: ["Are my recorded episodes clustering around periods of poor sleep or higher stress?", "How often have I recorded episodes over time?", "Does adherence to an existing routine appear associated with my tracked episode frequency?"],
    experiment: "If I follow a consistent sleep routine, does my recorded episode frequency change over the observation period?",
    caution: "AXVital does not assess transmission risk, prevent transmission, or replace antiviral therapy. An absence of recorded episodes does not mean transmission is not possible. Discuss care and prevention questions with a healthcare professional.",
    title: "HSV Episode Tracking & Personal Health Insights | AXVital",
    description: "Keep a judgment-free personal record of HSV episodes and everyday context. Explore your tracked history, routines, and questions with AXVital.",
  },
};

export function getConditionCampaign(slug: string): ConditionCampaign | undefined {
  return Object.hasOwn(conditionCampaigns, slug) ? conditionCampaigns[slug] : undefined;
}

export function isConditionCampaignPath(path: string) {
  return /^\/conditions\/[^/]+\/?$/.test(path);
}
