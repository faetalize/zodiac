export class Personality {
    constructor(name = "", image = "", description = "", prompt = "", aggressiveness = 0, sensuality = 0, internetEnabled = false, roleplayEnabled = false, toneExamples = []) {
        this.name = name;
        this.image = image;
        this.description = description;
        this.prompt = prompt;
        this.aggressiveness = aggressiveness;
        this.sensuality = sensuality;
        this.internetEnabled = internetEnabled;
        this.roleplayEnabled = roleplayEnabled;
        this.toneExamples = toneExamples;
    }
}