!!!! THIS PROJECT IS **STILL ACTIVE** - I AM JUST TAKING A SMALL BREAK !!!!!

# zodiac
A frontend built to interface with Google's Gemini Pro, built with vanilla JS. Get your API key here: [Google AI Suite](https://makersuite.google.com/app/apikey)

![image](https://github.com/faetalize/zodiac/assets/134988598/914ff978-2611-4e9f-b00f-55966b238dcb)

## New Features
- Support for multi-agent workflows
- Ability to create and manage "tools" and "skills" for agents

## How to use?
Download the repo, and open `zodiac.html` in a browser of your choice. **That's it.**

*Alternatively, here's an online version you can try if you would rather not locally run it:* [zodiac online](https://faetalize.github.io/zodiac/zodiac.html)

## Multi-Agent Workflows
You can now create and manage multiple agents, each with their own tools and skills. This allows for more complex interactions and workflows.

### Creating an Agent
To create an agent, use the `Agent` class:
```javascript
const agent = new Agent("Agent Name");
```

### Adding Tools and Skills to an Agent
You can add tools and skills to an agent using the `addTool` and `addSkill` methods:
```javascript
agent.addTool("Tool Name");
agent.addSkill("Skill Name");
```

### Interacting with Agents
Agents can interact with messages using the `interact` method:
```javascript
const response = agent.interact("Message");
console.log(response);
```

## Managing Tools and Skills
You can manage tools and skills for agents through the UI. Use the "Add Tool" and "Add Skill" buttons to add new tools and skills.

## Examples of Multi-Agent Workflows
Here are some examples of how you can use multi-agent workflows:

### Example 1: Simple Interaction
```javascript
const agent1 = new Agent("Agent 1");
const agent2 = new Agent("Agent 2");

agent1.addTool("Tool 1");
agent2.addSkill("Skill 1");

const message = "Hello, Agent 1!";
const response1 = agent1.interact(message);
const response2 = agent2.interact(response1);

console.log(response2);
```

### Example 2: Complex Workflow
```javascript
const agent1 = new Agent("Agent 1");
const agent2 = new Agent("Agent 2");
const agent3 = new Agent("Agent 3");

agent1.addTool("Tool 1");
agent2.addSkill("Skill 1");
agent3.addTool("Tool 2");
agent3.addSkill("Skill 2");

const message = "Start the workflow!";
const response1 = agent1.interact(message);
const response2 = agent2.interact(response1);
const response3 = agent3.interact(response2);

console.log(response3);
```

## Sponsor my development
You may support me finantially here: [LiberaPay](https://liberapay.com/faetalize) or [Patreon](https://patreon.com/faetalize)
I have zero plans to ever monetize my projects, no matter how popular they get. All features will be available to all. Your donations will be used in order to fund my technical needs (IDE subscriptions, testing products for RnD, etc)
