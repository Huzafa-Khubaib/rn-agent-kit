"use strict";
/**
 * ESLint plugin: rn-agentic-dev/no-hardcoded-design-values
 * Components must read colors, fonts and spacing from the generated theme (useTheme()), never literals.
 */
const COLOR_RE =
  /^\s*(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklch)\([^)]*\))\s*$/i;
const NAMED_COLORS = new Set([
  "white",
  "black",
  "red",
  "green",
  "blue",
  "yellow",
  "orange",
  "purple",
  "pink",
  "gray",
  "grey",
  "brown",
  "cyan",
  "magenta",
  "teal",
  "navy",
  "silver",
  "gold",
]);
const COLOR_PROP = /colou?r$/i;
const FONT_PROP = /^fontFamily$/;
const SPACING_PROP =
  /^(margin|padding)(Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?$|^(gap|rowGap|columnGap)$|^border(Top|Bottom)?(Left|Right|Start|End)?Radius$/;
const TYPE_SIZE_PROP = /^(fontSize|lineHeight|letterSpacing)$/;
const DEFAULT_ALLOWED_PATHS = [
  "/shared/theme/",
  "/design/",
  ".test.",
  ".spec.",
  "__tests__",
  ".config.",
];

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow hardcoded colors, font families and spacing; use theme tokens.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowedPaths: { type: "array", items: { type: "string" } },
          allowedValues: { type: "array", items: { type: "string" } },
          allowedNumbers: { type: "array", items: { type: "number" } },
          checkColors: { type: "boolean" },
          checkFonts: { type: "boolean" },
          checkDimensions: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      hardcodedColor:
        'Hardcoded color "{{value}}". Use a theme token, e.g. theme.colors.<group>.<name> from useTheme().',
      hardcodedFont:
        'Hardcoded fontFamily "{{value}}". Use theme.typography.* or theme.fontFamilies.*.',
      hardcodedDimension:
        "Hardcoded {{prop}}: {{value}}. Use theme.spacing.* / theme.radius.* / theme.typography.*.",
    },
  },
  create(context) {
    const opts = context.options[0] || {};
    const file = String(context.filename || context.getFilename()).replace(/\\/g, "/");
    if ((opts.allowedPaths || DEFAULT_ALLOWED_PATHS).some((p) => file.includes(p))) return {};
    const allowedValues = new Set(
      (opts.allowedValues || ["transparent", "currentcolor", "inherit"]).map((v) =>
        v.toLowerCase(),
      ),
    );
    const allowedNumbers = new Set(opts.allowedNumbers || [0]);
    const checkColors = opts.checkColors !== false;
    const checkFonts = opts.checkFonts !== false;
    const checkDimensions = opts.checkDimensions !== false;

    const keyName = (prop) => {
      if (prop.computed) return null;
      if (prop.key.type === "Identifier") return prop.key.name;
      if (prop.key.type === "Literal") return String(prop.key.value);
      return null;
    };
    const reportColor = (node, value) => {
      if (!allowedValues.has(String(value).trim().toLowerCase()))
        context.report({ node, messageId: "hardcodedColor", data: { value } });
    };

    return {
      Literal(node) {
        if (checkColors && typeof node.value === "string" && COLOR_RE.test(node.value))
          reportColor(node, node.value);
      },
      TemplateLiteral(node) {
        if (!checkColors || node.expressions.length) return;
        const text = node.quasis[0] && node.quasis[0].value.cooked;
        if (text && COLOR_RE.test(text)) reportColor(node, text);
      },
      Property(node) {
        const name = keyName(node);
        if (!name || node.value.type !== "Literal") return;
        const v = node.value.value;
        if (
          checkColors &&
          COLOR_PROP.test(name) &&
          typeof v === "string" &&
          !COLOR_RE.test(v) &&
          NAMED_COLORS.has(v.toLowerCase())
        ) {
          reportColor(node.value, v);
        } else if (checkFonts && FONT_PROP.test(name) && typeof v === "string") {
          context.report({ node: node.value, messageId: "hardcodedFont", data: { value: v } });
        } else if (
          checkDimensions &&
          (SPACING_PROP.test(name) || TYPE_SIZE_PROP.test(name)) &&
          typeof v === "number" &&
          !allowedNumbers.has(v)
        ) {
          context.report({
            node: node.value,
            messageId: "hardcodedDimension",
            data: { prop: name, value: String(v) },
          });
        }
      },
    };
  },
};

module.exports = { meta: { name: "rn-agentic-dev" }, rules: { "no-hardcoded-design-values": rule } };
