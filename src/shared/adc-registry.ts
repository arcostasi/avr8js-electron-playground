/**
 * ADC Channel Registry
 * Manages analog values (0-1023) for each ADC channel on the ATmega328p.
 * Supports both static values and live-bound DOM elements (e.g., potentiometers).
 *
 * When an element is bound to a channel, getChannel() reads its live `.value`
 * property — ensuring the ADC always reflects the component's current state.
 */

interface ADCChannelBinding {
    /** Static fallback value */
    value: number;
    /** Optional live DOM element (e.g., wokwi-potentiometer) */
    element?: HTMLElement;
    /** Property name to read from the element (default: 'value') */
    property: string;
    /** Scale factor: element value × scale = ADC value (0-1023) */
    scale: number;
    /** Offset added after scaling */
    offset: number;
}

export class ADCRegistry {
    private channels: ADCChannelBinding[] = [];

    constructor() {
        for (let i = 0; i < 8; i++) {
            this.channels.push({ value: 0, property: 'value', scale: 1, offset: 0 });
        }
    }

    /**
     * Set a static value for an ADC channel (0-7).
     */
    setValue(channel: number, value: number): void {
        if (channel >= 0 && channel < 8) {
            this.channels[channel].value = Math.max(0, Math.min(1023, Math.round(value)));
        }
    }

    /**
     * Bind a DOM element to an ADC channel.
     * When getChannel() is called, the element's property is read live.
     *
     * @param channel  ADC channel number (0-7)
     * @param element  The Wokwi custom element
     * @param property Property name to read (default: 'value')
     * @param scale    Multiplier applied to the property value (default: 1)
     * @param offset   Offset added after scaling (default: 0)
     */
    bindElement(
        channel: number,
        element: HTMLElement,
        property = 'value',
        scale = 1,
        offset = 0,
    ): void {
        if (channel >= 0 && channel < 8) {
            this.channels[channel] = { value: 0, element, property, scale, offset };
        }
    }

    /**
     * Read the current ADC value for a channel (0-1023).
     * If an element is bound, reads its live property; otherwise returns the static value.
     */
    getChannel(channel: number): number {
        if (channel < 0 || channel >= 8) return 0;

        const ch = this.channels[channel];
        if (ch.element) {
            const raw = Number((ch.element as unknown as Record<string, unknown>)[ch.property]) || 0;
            const scaled = raw * ch.scale + ch.offset;
            return Math.max(0, Math.min(1023, Math.round(scaled)));
        }
        return ch.value;
    }

    /**
     * Reset all channels to zero and unbind all elements.
     */
    reset(): void {
        for (let i = 0; i < 8; i++) {
            this.channels[i] = { value: 0, property: 'value', scale: 1, offset: 0 };
        }
    }
}
