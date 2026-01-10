// Definitions of subtypes are below
export type Request = {
    // Either "messages" or "prompt" is required
    messages?: Message[];
    prompt?: string;

    reasoning?: {
        effort?: 'high' | 'medium' | 'low';
        max_tokens?: number;
        exclude?: boolean;
    }

    // If "model" is unspecified, uses the user's default
    model?: string; // See "Supported Models" section

    // Allows to force the model to produce specific output format.
    // See models page and note on this docs page for which models support it.
    response_format?: { type: 'json_object' };

    stop?: string | string[];
    stream?: boolean; // Enable streaming

    // See LLM Parameters (openrouter.ai/docs/api-reference/parameters)
    max_tokens?: number; // Range: [1, context_length)
    temperature?: number; // Range: [0, 2]

    // Tool calling
    // Will be passed down as-is for providers implementing OpenAI's interface.
    // For providers with custom interfaces, we transform and map the properties.
    // Otherwise, we transform the tools into a YAML template. The model responds with an assistant message.
    // See models supporting tool calling: openrouter.ai/models?supported_parameters=tools
    tools?: Tool[];
    tool_choice?: ToolChoice;

    // Advanced optional parameters
    seed?: number; // Integer only
    top_p?: number; // Range: (0, 1]
    top_k?: number; // Range: [1, Infinity) Not available for OpenAI models
    frequency_penalty?: number; // Range: [-2, 2]
    presence_penalty?: number; // Range: [-2, 2]
    repetition_penalty?: number; // Range: (0, 2]
    logit_bias?: { [key: number]: number };
    top_logprobs?: number; // Integer only
    min_p?: number; // Range: [0, 1]
    top_a?: number; // Range: [0, 1]

    // Reduce latency by providing the model with a predicted output
    // https://platform.openai.com/docs/guides/latency-optimization#use-predicted-outputs
    prediction?: { type: 'content'; content: string };

    // OpenRouter-only parameters
    // See "Prompt Transforms" section: openrouter.ai/docs/transforms
    transforms?: string[];
    // See "Model Routing" section: openrouter.ai/docs/model-routing
    models?: string[];
    route?: 'fallback';
    // See "Provider Routing" section: openrouter.ai/docs/provider-routing
    provider?: ProviderPreferences;
    user?: string; // A stable identifier for your end-users. Used to help detect and prevent abuse.
};

// Subtypes:

export type TextContent = {
    type: 'text';
    text: string;
};

export type ImageContentPart = {
    type: 'image_url';
    image_url: {
        url: string; // URL or base64 encoded image data
        detail?: string; // Optional, defaults to "auto"
    };
};

export type FileContentPart = {
    type: 'file';
    file: {
        filename: string;
        file_data: string; // base64 encoded file data OR URL
    }
};

export type ContentPart = TextContent | ImageContentPart | FileContentPart;

export type Message =
    | {
        role: 'user' | 'assistant' | 'system' | 'developer';
        // ContentParts are only for the "user" role:
        content: string | ContentPart[];
        // If "name" is included, it will be prepended like this
        // for non-OpenAI models: `{name}: {content}`
        name?: string;
    }
    | {
        role: 'tool';
        content: string;
        tool_call_id: string;
        name?: string;
    };

type FunctionDescription = {
    description?: string;
    name: string;
    parameters: object; // JSON Schema object
};

type Tool = {
    type: 'function';
    function: FunctionDescription;
};

type ToolChoice =
    | 'none'
    | 'auto'
    | {
        type: 'function';
        function: {
            name: string;
        };
    };


interface ProviderPreferences {
    /**
     * Whether to allow backup providers to serve requests
     * - true: (default) when the primary provider (or your custom providers in "order") is
     * unavailable, use the next best provider.
     * - false: use only the primary/custom provider, and return the upstream error if it's
     * unavailable.
     */
    allow_fallbacks?: boolean | null;
    /**
     * Data collection setting. If no available model provider meets the requirement, your
     * request will return an error.
     * - allow: (default) allow providers which store user data non-transiently and may train on
     * it
     * - deny: use only providers which do not collect user data.
     */
    data_collection?: DataCollection | null;
    experimental?: Experimental | null;
    /**
     * List of provider slugs to ignore. If provided, this list is merged with your account-wide
     * ignored provider settings for this request.
     */
    ignore?: string[] | null;
    /**
     * The object specifying the maximum price you want to pay for this request. USD price per
     * million tokens, for prompt and completion.
     */
    max_price?: MaxPrice;
    /**
     * List of provider slugs to allow. If provided, this list is merged with your account-wide
     * allowed provider settings for this request.
     */
    only?: string[] | null;
    /**
     * An ordered list of provider slugs. The router will attempt to use the first provider in
     * the subset of this list that supports your requested model, and fall back to the next if
     * it is unavailable. If no providers are available, the request will fail with an error
     * message.
     */
    order?: string[] | null;
    /**
     * A list of quantization levels to filter the provider by.
     */
    quantizations?: Quantization[] | null;
    /**
     * Whether to filter providers to only those that support the parameters you've provided. If
     * this setting is omitted or set to false, then providers will receive only the parameters
     * they support, and ignore the rest.
     */
    require_parameters?: boolean | null;
    /**
     * The sorting strategy to use for this request, if "order" is not specified. When set, no
     * load balancing is performed.
     */
    sort?: Sort | null;
    zdr?: boolean | null;
}

export enum DataCollection {
    Allow = "allow",
    Deny = "deny",
}

export interface Experimental {
}

/**
 * The object specifying the maximum price you want to pay for this request. USD price per
 * million tokens, for prompt and completion.
 */
export interface MaxPrice {
    audio?: any;
    completion?: any;
    image?: any;
    prompt?: any;
    request?: any;
}

export enum Quantization {
    Bf16 = "bf16",
    Fp16 = "fp16",
    Fp32 = "fp32",
    Fp4 = "fp4",
    Fp6 = "fp6",
    Fp8 = "fp8",
    Int4 = "int4",
    Int8 = "int8",
    Unknown = "unknown",
}

export enum Sort {
    Latency = "latency",
    Price = "price",
    Throughput = "throughput",
}


// Definitions of subtypes are below
export type Response = {
    id: string;
    // Depending on whether you set "stream" to "true" and
    // whether you passed in "messages" or a "prompt", you
    // will get a different output shape
    choices: (NonStreamingChoice | StreamingChoice | NonChatChoice)[];
    created: number; // Unix timestamp
    model: string;
    object: 'chat.completion' | 'chat.completion.chunk';

    system_fingerprint?: string; // Only present if the provider supports it

    // Usage data is always returned for non-streaming.
    // When streaming, you will get one usage object at
    // the end accompanied by an empty choices array.
    usage?: ResponseUsage;
};


// Subtypes:
export type NonChatChoice = {
    finish_reason: string | null;
    text: string;
    error?: ErrorResponse;
};

export type NonStreamingChoice = {
    finish_reason: string | null;
    native_finish_reason: string | null;
    message: {
        content: string | null;
        role: string;
        tool_calls?: ToolCall[];
    };
    error?: ErrorResponse;
};

export type StreamingChoice = {
    finish_reason: string | null;
    native_finish_reason: string | null;
    delta: {
        content: string | null;
        role?: string;
        tool_calls?: ToolCall[];
        reasoning?: string; // Optional chain-of-thought / reasoning text
    };
    error?: ErrorResponse;
};

type ErrorResponse = {
    code: number; // See "Error Handling" section
    message: string;
    metadata?: Record<string, unknown>; // Contains additional error information such as provider details, the raw error message, etc.
};

type ToolCall = {
    id: string;
    type: 'function';
    function: FunctionCall;
};

// If the provider returns usage, we pass it down
// as-is. Otherwise, we count using the GPT-4 tokenizer.

type ResponseUsage = {
    /** Including images and tools if any */
    prompt_tokens: number;
    /** The tokens generated */
    completion_tokens: number;
    /** Sum of the above two fields */
    total_tokens: number;
};
//alias to any for now
type FunctionCall = any; // See "Tool Calling" section
