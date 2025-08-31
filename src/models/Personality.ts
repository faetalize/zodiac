export interface Personality {
    name: string;
    image: string;
    description: string;
    prompt: string;
    aggressiveness: number;
    sensuality: number;
    internetEnabled: boolean;
    roleplayEnabled: boolean;
    toneExamples: string[];
}

export interface DbPersonality extends Personality {
    id: string;
}