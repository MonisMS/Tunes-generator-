import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track 
      className="relative h-2 w-full grow overflow-hidden rounded-full"
      style={{ backgroundColor: 'oklch(0.8567 0.1164 81.0092 / 0.3)' }}
    >
      <SliderPrimitive.Range 
        className="absolute h-full" 
        style={{ backgroundColor: 'oklch(0.4815 0.1178 263.3758)' }}
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb 
      className="block h-5 w-5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" 
      style={{ 
        borderWidth: '2px',
        borderColor: 'oklch(0.4815 0.1178 263.3758)',
        backgroundColor: 'oklch(0.9755 0.0045 258.3245)',
        boxShadow: '0 0 0 0 oklch(0.9755 0.0045 258.3245)'
      }}
    />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
