// Keep AST analysis and the final compilation in the same language dialect.
export const CPP_STANDARD = "c++23";
// Flowchart documents created under C++17 may contain u8 output literals.
// C++20 made these char8_t arrays, whose standard ostream overload is deleted.
// Keep this explicit adapter confined to generated diagrams.
export const FLOW_CPP_COMPAT =
  "inline std::ostream& operator<<(std::ostream& out,const char8_t* text){return out<<reinterpret_cast<const char*>(text);}\n";
