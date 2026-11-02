import { expect, it } from "vitest";
import { createRecoveryReference } from "./interviewRecoveryReference";
it("keeps recovery references scoped to the signed-in owner and excludes content", async () => {
 const values = new Map<string,string>();
 const reference=createRecoveryReference({getItem:async key=>values.get(key)??null,setItem:async(key,value)=>{values.set(key,value);},removeItem:async key=>{values.delete(key);}});
 const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222', interview='33333333-3333-4333-8333-333333333333';
 await reference.save(owner,interview);
 expect(await reference.read(owner)).toBe(interview);expect(await reference.read(other)).toBeNull();
 await reference.save(owner,'private transcript');expect(await reference.read(owner)).toBe(interview);
 expect([...values.values()]).toEqual([interview]);
 await reference.clear(owner);expect(await reference.read(owner)).toBeNull();
});
