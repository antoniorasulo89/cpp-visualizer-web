#pragma once
#include <iostream>
#include <iomanip>
#include <string>
#include <sstream>
#include <type_traits>
#include <utility>
#include <cstdint>
extern "C" __attribute__((import_module("env"), import_name("cv_trace"))) void __cv_trace(int,const char*,double);
extern "C" __attribute__((import_module("env"), import_name("cv_text"))) void __cv_text(int,const char*,const char*,unsigned);
extern "C" __attribute__((import_module("env"), import_name("cv_flow_reset"))) void __cv_flow_reset();
extern "C" __attribute__((import_module("env"), import_name("cv_flow_commit"))) void __cv_flow_commit(int,int);
#ifndef CV_INTERACTIVE
#define CV_INTERACTIVE 0
#endif
#if CV_INTERACTIVE
extern "C" __attribute__((import_module("env"), import_name("cv_input"))) void __cv_input(int,const char*,int,int,int);
static std::uint32_t __cv_async_region[2];
alignas(16) static unsigned char __cv_async_stack[262144];
extern "C" __attribute__((export_name("cv_async_data"))) unsigned __cv_async_data() {
  __cv_async_region[0]=reinterpret_cast<unsigned>(__cv_async_stack);
  __cv_async_region[1]=reinterpret_cast<unsigned>(__cv_async_stack+sizeof(__cv_async_stack));
  return reinterpret_cast<unsigned>(__cv_async_region);
}
#endif
#define OSSERVA(x) ::__cv_trace(__LINE__, #x, static_cast<double>(x))
namespace __cv_runtime {
struct Entry {
  virtual bool contains(const void*) const = 0;
  virtual bool ready(const void*) const = 0;
  virtual void mark(const void*) = 0;
  virtual void emit() const = 0;
  virtual std::string inputLabel(const void*) const = 0;
  virtual ~Entry() = default;
};
static Entry* entries[200];
static unsigned count = 0, frameSerial = 0, depth = 0;
static std::string frame;
struct Frame {
  std::string previous;
  Frame(const char* name) : previous(frame) {
    if (++depth > 128) ::__cv_flow_commit(0,-5);
    frame = std::string(name) == "main" ? "" : std::string(name) + "#" + std::to_string(++frameSerial) + " · ";
  }
  ~Frame() { frame = previous; --depth; }
};
inline void checkAddress(const void* address) {
  for (unsigned i=0;i<count;++i) if (entries[i]->contains(address) && !entries[i]->ready(address)) ::__cv_flow_commit(0,-4);
}
inline void markAddress(const void* address) {
  for (unsigned i=0;i<count;++i) if(entries[i]->contains(address)) entries[i]->mark(address);
}
template<class T> struct Watch : Entry {
  static constexpr unsigned length = std::is_array_v<T> ? std::extent_v<T> : 1;
  using Element = std::remove_extent_t<T>;
  std::string name;
  const T* address;
  bool initialized[length], visible;
  Watch(const char* label, const T* location, bool ready=true, bool show=true) : name(frame+label), address(location), visible(show) {
    if (count >= 200) { ::__cv_flow_commit(0,-3); return; }
    if constexpr (std::is_array_v<T>) { if(length>100) ::__cv_flow_commit(0,-6); }
    for(unsigned i=0;i<length;++i) {
      initialized[i]=ready;
      const auto cell=reinterpret_cast<const Element*>(location)+i;
      // References share storage, not an independent initialized value. Never
      // read that storage while registering a reference or a reference parameter.
      for(unsigned j=0;j<count;++j)
        if(entries[j]->contains(cell) && !entries[j]->ready(cell)) initialized[i]=false;
    }
    entries[count++] = this;
  }
  ~Watch() { --count; }
  unsigned index(const void* pointer) const { return (reinterpret_cast<std::uintptr_t>(pointer)-reinterpret_cast<std::uintptr_t>(address))/sizeof(Element); }
  bool contains(const void* pointer) const override {
    auto p=reinterpret_cast<std::uintptr_t>(pointer), a=reinterpret_cast<std::uintptr_t>(address);
    return p>=a && p<a+sizeof(T);
  }
  bool ready(const void* pointer) const override { return index(pointer)<length && initialized[index(pointer)]; }
  void mark(const void* pointer) override { if(index(pointer)<length) initialized[index(pointer)]=true; visible=true; }
  void check() const { if(!initialized[0]) ::__cv_flow_commit(0,-4); }
  std::string inputLabel(const void* pointer) const override { return name+(std::is_array_v<T> ? "["+std::to_string(index(pointer))+"]" : ""); }
  template<class U> static void print(std::ostream& out,const U& value) {
    if constexpr (std::is_pointer_v<U>) out << static_cast<const void*>(value);
    else if constexpr (std::is_same_v<std::remove_cv_t<U>, char>) out << static_cast<int>(value);
    else out << value;
  }
  void emit() const override {
    if(!visible) return;
    if constexpr(std::is_arithmetic_v<T>) {
      if(initialized[0]) ::__cv_trace(0,name.c_str(),static_cast<double>(*address));
      else ::__cv_text(0,name.c_str(),"?",1);
    } else {
      std::ostringstream out;
      if constexpr(std::is_array_v<T>) {
        out << '[';
        for(unsigned i=0;i<length;++i) { if(i)out << ", "; if(initialized[i])print(out,(*address)[i]);else out << '?'; }
        out << ']';
      } else if(initialized[0]) print(out,*address); else out << '?';
      const auto value=out.str(); ::__cv_text(0,name.c_str(),value.data(),value.size());
    }
  }
  Watch(const Watch&) = delete;
  Watch& operator=(const Watch&) = delete;
};
template<class T> T& read(T& value) { checkAddress(&value); return value; }
template<class T> decltype(auto) written(T&& value) { markAddress(&value);return std::forward<T>(value); }
template<bool Postfix,class T> decltype(auto) increment(T& value) {
  checkAddress(&value);
  if constexpr(Postfix) {auto old=value;++value;markAddress(&value);return old;}
  else {++value;markAddress(&value);return (value);}
}
template<bool Postfix,class T> decltype(auto) decrement(T& value) {
  checkAddress(&value);
  if constexpr(Postfix) {auto old=value;--value;markAddress(&value);return old;}
  else {--value;markAddress(&value);return (value);}
}
inline void snapshot(int line,int result);
template<class T> void askInput(T& value,int line,bool wholeLine=false) {
#if CV_INTERACTIVE
  std::cout.flush(); ::__cv_flow_reset();
  for(unsigned i=0;i<count;++i) entries[i]->emit();
  std::string label;
  for(unsigned i=count;i>0;--i) if(entries[i-1]->contains(&value)) {label=entries[i-1]->inputLabel(&value);break;}
  constexpr int kind=std::is_same_v<T,std::string> ? 4 : std::is_same_v<T,bool> ? 6 : (std::is_same_v<T,char> || std::is_same_v<T,signed char> || std::is_same_v<T,unsigned char>) ? 3 : std::is_floating_point_v<T> ? 2 : std::is_integral_v<T> ? 1 : 0;
  ::__cv_input(line,label.c_str(),wholeLine?5:kind,sizeof(T)*8,std::is_signed_v<T>);
#endif
}
template<class T> struct Destination { T& value; int line; };
template<class T> Destination<T> destination(T& value,int line=0) {return {value,line};}
template<class T> std::istream& operator>>(std::istream& input,Destination<T> to) {
  if(&input==&std::cin) askInput(to.value,to.line);
  if(input >> to.value) {markAddress(&to.value);if constexpr(CV_INTERACTIVE) snapshot(to.line,-1);}return input;
}
template<class T> std::istream& readLine(std::istream& input,T& value,int line=0) {
  if(&input==&std::cin) askInput(value,line,true);
  if(std::getline(input,value)) {markAddress(&value);if constexpr(CV_INTERACTIVE) snapshot(line,-1);}return input;
}
inline void requireInput() {if(!std::cin) {std::cout.flush();::__cv_flow_commit(0,-2);}}
inline void snapshot(int line,int result=-1) {
  std::cout.flush(); ::__cv_flow_reset();
  for(unsigned i=0;i<count;++i) entries[i]->emit();
  ::__cv_flow_commit(line,result);
}
template<class T> bool test(int line,T&& value) {bool result=static_cast<bool>(value);snapshot(line,result?1:0);return result;}
template<class T> auto returned(int line,T&& value) {snapshot(line);return std::forward<T>(value);}
}
