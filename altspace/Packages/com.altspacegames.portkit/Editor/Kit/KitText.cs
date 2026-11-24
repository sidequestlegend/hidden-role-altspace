using System;
using System.Collections.Generic;
using System.Text;
using TMPro;
using UnityEngine;

namespace PortKit
{
    /// <summary>
    /// Legacy uGUI Text to TextMeshPro, for kits made from VRChat prefabs. A kit must hold everything it draws with: legacy
    /// Text uses a built-in font (Arial, which Unity 6 no longer has, or LegacyRuntime), which a bundle does not carry.
    /// Call it from KitBuilder.Finishing: the bindings have read the stand-ins' references by then (a text field is
    /// {"$comp": key}: it names the object, so it still holds once the component has changed), and the relay's text op
    /// writes TextMeshPro first.
    /// </summary>
    public static class KitText
    {
        /// <summary>
        /// Replaces every legacy Text under `root` (inactive ones too) with a TextMeshProUGUI of the same text, size,
        /// alignment, colour and wrapping. `fontFor` picks the font asset per text (by its old font, say); null: LiberationSans.
        /// `materialFor` may give a material preset (a culled one for text that must not show from behind). Returns how many.
        /// </summary>
        public static int ToTextMeshPro(GameObject root, Func<UnityEngine.UI.Text, TMP_FontAsset> fontFor = null,
                                        Func<UnityEngine.UI.Text, Material> materialFor = null, StringBuilder report = null)
        {
            var fallback = DefaultFont();
            var texts = new List<UnityEngine.UI.Text>(root.GetComponentsInChildren<UnityEngine.UI.Text>(true));
            foreach (var text in texts)
            {
                var go = text.gameObject;
                string value = text.text;
                int size = text.fontSize;
                var anchor = text.alignment;
                var colour = text.color;
                bool rich = text.supportRichText;
                bool wrap = text.horizontalOverflow == HorizontalWrapMode.Wrap;
                bool overflow = text.verticalOverflow == VerticalWrapMode.Overflow;
                bool best = text.resizeTextForBestFit;
                int bestMin = text.resizeTextMinSize, bestMax = text.resizeTextMaxSize;
                bool raycast = text.raycastTarget;
                var style = text.fontStyle;
                var font = fontFor?.Invoke(text) ?? fallback;
                var material = materialFor?.Invoke(text);
                UnityEngine.Object.DestroyImmediate(text);

                var tmp = go.AddComponent<TextMeshProUGUI>();
                if (font != null) tmp.font = font;
                if (material != null) tmp.fontSharedMaterial = material;
                tmp.text = value;
                tmp.fontSize = size;
                tmp.color = colour;
                tmp.richText = rich;
                tmp.textWrappingMode = wrap ? TextWrappingModes.Normal : TextWrappingModes.NoWrap;
                tmp.overflowMode = overflow ? TextOverflowModes.Overflow : TextOverflowModes.Truncate;
                tmp.raycastTarget = raycast;
                tmp.alignment = Alignment(anchor);
                tmp.fontStyle = (style == FontStyle.Bold ? FontStyles.Bold : 0) | (style == FontStyle.Italic ? FontStyles.Italic : 0) |
                                (style == FontStyle.BoldAndItalic ? FontStyles.Bold | FontStyles.Italic : 0);
                if (best)
                {
                    tmp.enableAutoSizing = true;
                    tmp.fontSizeMin = bestMin;
                    tmp.fontSizeMax = bestMax;
                }
            }
            if (texts.Count > 0) report?.AppendLine($"   {texts.Count} legacy UI texts made TextMeshPro");
            return texts.Count;
        }

        /// <summary>LiberationSans SDF from TextMesh Pro's essentials (SIL Open Font License), which the SDK setup imports.</summary>
        public static TMP_FontAsset DefaultFont() =>
            UnityEditor.AssetDatabase.LoadAssetAtPath<TMP_FontAsset>("Assets/TextMesh Pro/Resources/Fonts & Materials/LiberationSans SDF.asset") ?? TMP_Settings.defaultFontAsset;

        public static TextAlignmentOptions Alignment(TextAnchor anchor)
        {
            switch (anchor)
            {
                case TextAnchor.UpperLeft: return TextAlignmentOptions.TopLeft;
                case TextAnchor.UpperCenter: return TextAlignmentOptions.Top;
                case TextAnchor.UpperRight: return TextAlignmentOptions.TopRight;
                case TextAnchor.MiddleLeft: return TextAlignmentOptions.Left;
                case TextAnchor.MiddleCenter: return TextAlignmentOptions.Center;
                case TextAnchor.MiddleRight: return TextAlignmentOptions.Right;
                case TextAnchor.LowerLeft: return TextAlignmentOptions.BottomLeft;
                case TextAnchor.LowerCenter: return TextAlignmentOptions.Bottom;
                default: return TextAlignmentOptions.BottomRight;
            }
        }

        /// <summary>
        /// A font asset with a static atlas of just `characters`, saved at `path` with its atlas and material inside it, so a
        /// bundle carries what it draws with (a dynamic asset would need the source font at run time). Made again each time.
        /// </summary>
        public static TMP_FontAsset StaticFontAsset(Font source, string characters, string path, int pointSize = 90, int atlas = 512)
        {
            UnityEditor.AssetDatabase.DeleteAsset(path);
            var asset = TMP_FontAsset.CreateFontAsset(source, pointSize, 9, UnityEngine.TextCore.LowLevel.GlyphRenderMode.SDFAA, atlas, atlas,
                                                      AtlasPopulationMode.Dynamic, false);
            if (asset == null) throw new Exception($"TextMesh Pro could not make a font asset from {source.name}");
            if (!asset.TryAddCharacters(characters, out string missing) && !string.IsNullOrEmpty(missing))
                Debug.LogWarning($"[portkit] {source.name} has no glyph for '{missing}'");
            asset.atlasPopulationMode = AtlasPopulationMode.Static;
            asset.name = System.IO.Path.GetFileNameWithoutExtension(path);
            UnityEditor.AssetDatabase.CreateAsset(asset, path);
            var texture = asset.atlasTexture;
            texture.name = asset.name + " Atlas";
            UnityEditor.AssetDatabase.AddObjectToAsset(texture, asset);
            asset.material.name = asset.name + " Material";
            UnityEditor.AssetDatabase.AddObjectToAsset(asset.material, asset);
            UnityEditor.EditorUtility.SetDirty(asset);
            UnityEditor.AssetDatabase.SaveAssets();
            return asset;
        }
    }
}
