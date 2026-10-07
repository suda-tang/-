declare const ElementBase: typeof HTMLElement;
declare class LiquidGlassElement extends ElementBase {
    static get observedAttributes(): string[];
    private readonly filterId;
    private readonly root;
    private ro?;
    private liquidRaf;
    private webgl?;
    /** Refresh cached HTML after stylesheet or external visual changes. */
    refreshBackdrop(): Promise<void>;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(): void;
    private render;
}
declare function defineLiquidGlass(tag?: string): void;

export { LiquidGlassElement, defineLiquidGlass };
