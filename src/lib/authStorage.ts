import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  createSecureAuthStorage,
  type StringStore,
} from "./authStorageAdapter";
const memory = new Map<string, string>();
const webStorage: StringStore = {
  async getItem(key) {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(key);
      return window.sessionStorage.getItem(key);
    }
    return memory.get(key) ?? null;
  },
  async setItem(key, value) {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(key, value);
    } else memory.set(key, value);
  },
  async removeItem(key) {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
    }
    memory.delete(key);
  },
};
const secure: StringStore = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};
export const authStorage = Platform.OS === "web"
  ? webStorage
  : createSecureAuthStorage(secure, AsyncStorage);
