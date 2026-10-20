(comment) @comment
(identifier) @variable
(type_identifier) @type
(predefined_type) @type.builtin
(property_identifier) @property
(shorthand_property_identifier) @property
(shorthand_property_identifier_pattern) @property
(number) @number
[(true) (false)] @boolean
[(null) (undefined)] @constant.builtin
(this) @variable.special
(super) @keyword
(string) @string
(template_string) @string
(escape_sequence) @string.escape
(regex) @string.regex

(function_declaration name: (identifier) @function)
(function_expression name: (identifier) @function)
(method_definition name: (property_identifier) @function)
(call_expression function: (identifier) @function)
(call_expression function: (member_expression property: (property_identifier) @function))
(new_expression constructor: (identifier) @constructor)
(required_parameter pattern: (identifier) @variable.parameter)
(optional_parameter pattern: (identifier) @variable.parameter)

[
 "as" "async" "await" "break" "case" "catch" "class" "const" "continue"
 "debugger" "declare" "default" "delete" "do" "else" "enum" "export"
 "extends" "finally" "for" "from" "function" "get" "if" "implements"
 "import" "in" "instanceof" "interface" "let" "namespace" "new" "of"
 "private" "protected" "public" "readonly" "return" "set" "static"
 "switch" "throw" "try" "type" "typeof" "var" "void" "while"
 "yield"
] @keyword

["=" "+" "-" "*" "/" "%" "==" "===" "!=" "!==" "<" ">" "<=" ">="
 "&&" "||" "!" "?" "??" "?." "=>" "++" "--" "+=" "-=" "*=" "/="
 "&" "|" "^" "~" "<<" ">>" ">>>"] @operator
["(" ")" "[" "]" "{" "}"] @punctuation.bracket
[";" "," "." ":"] @punctuation.delimiter
