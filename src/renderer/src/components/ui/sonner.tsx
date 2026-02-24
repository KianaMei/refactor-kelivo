
import { Toaster as Sonner } from "sonner"
import type { ComponentProps } from "react"

type ToasterProps = ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
    return (
        <Sonner
            theme="system"
            closeButton
            position="top-center"
            className="toaster group"
            toastOptions={{
                classNames: {
                    toast:
                        "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
                    description: "group-[.toast]:text-muted-foreground",
                    actionButton:
                        "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
                    cancelButton:
                        "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
                    closeButton:
                        "group-[.toast]:text-muted-foreground group-[.toast]:hover:text-foreground group-[.toast]:border group-[.toast]:border-border group-[.toast]:bg-transparent group-[.toast]:hover:bg-muted/50",
                },
            }}
            {...props}
        />
    )
}

export { Toaster }
