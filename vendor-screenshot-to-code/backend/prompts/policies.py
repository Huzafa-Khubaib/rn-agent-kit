from prompts.prompt_types import Stack, is_react_native_stack


def build_selected_stack_policy(stack: Stack) -> str:
    if stack == "react_native":
        return (
            "Selected stack: react_native.\n"
            "Generate a React Native (TypeScript) App.tsx that matches the design exactly. "
            "Use View/Text/Image/StyleSheet — never HTML or Tailwind CDN."
        )
    if stack == "expo":
        return (
            "Selected stack: expo.\n"
            "Generate an Expo-compatible React Native (TypeScript) App.tsx that matches "
            "the design exactly. Prefer Expo APIs/packages. Never HTML or Tailwind CDN."
        )
    return f"Selected stack: {stack}."


def build_user_image_policy(image_generation_enabled: bool) -> str:
    if image_generation_enabled:
        return (
            "Image generation is enabled for this request. Use generate_images for "
            "missing assets when needed."
        )

    return (
        "Image generation is disabled for this request. Do not call generate_images. "
        "Use provided media, CSS effects, or placeholder URLs (https://placehold.co)."
    )


def default_file_path_for_stack(stack: Stack) -> str:
    return "App.tsx" if is_react_native_stack(stack) else "index.html"
