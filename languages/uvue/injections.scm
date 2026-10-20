((script_element (raw_text) @content)
 (#set! "language" "uts"))

((style_element (raw_text) @content)
 (#set! "language" "css"))

((interpolation (raw_text) @content)
 (#set! "language" "uts"))

((directive_attribute (quoted_attribute_value (attribute_value) @content))
 (#set! "language" "uts"))
