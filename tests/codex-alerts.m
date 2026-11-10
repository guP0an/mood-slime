#import "../CodexAlerts.h"
#include <assert.h>
#include <sqlite3.h>

int main(int argc,const char *argv[]){@autoreleasepool{
    if(argc==3&&strcmp(argv[1],"--read-inbox")==0){
        CodexAlerts *reader=[[CodexAlerts alloc] initWithRoot:[NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[2]]]];
        assert([reader poll]&&reader.items.count==1);
        assert([reader.items.firstObject[@"thread"] isEqual:@"synthetic-thread"]&&[reader.items.firstObject[@"kind"] isEqual:@"approval"]);
        assert(![reader.items.firstObject.description containsString:@"SYNTHETIC_PRIVATE"]);
        puts("PASS: Python lifecycle hook -> atomic inbox file -> native alert reader");return 0;
    }
    NSURL *root=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString]];
    [NSFileManager.defaultManager createDirectoryAtURL:root withIntermediateDirectories:YES attributes:nil error:NULL];
    CodexAlerts *inbox=[[CodexAlerts alloc] initWithRoot:root];
    double now=NSDate.date.timeIntervalSince1970;
    NSDictionary *(^event)(NSString *,NSString *,double)=^NSDictionary *(NSString *letter,NSString *kind,double at){return @{@"version":@1,@"id":[@"" stringByPaddingToLength:64 withString:letter startingAtIndex:0],@"thread":@"synthetic-thread",@"kind":kind,@"at":@(at)};};
    NSDictionary *approval=event(@"a",@"approval",now-4);
    assert([CodexAlerts validEvent:approval]);assert([inbox accept:approval]);assert(![inbox accept:approval]);assert(inbox.items.count==1);
    assert(![inbox accept:event(@"b",@"completed",now-5)]);
    assert([inbox accept:event(@"c",@"clear",now-3)]&&inbox.items.count==0);
    assert([inbox accept:event(@"d",@"completed",now-2)]);
    assert([inbox accept:event(@"e",@"clear",now-1)]&&inbox.items.count==0);
    NSMutableDictionary *waiting=[event(@"1",@"question",now) mutableCopy];waiting[@"turn"]=@"turn-one";waiting[@"title"]=@"设计桌面心情日历";
    assert([inbox accept:waiting]);assert([inbox.items.firstObject[@"title"] isEqual:waiting[@"title"]]);
    NSMutableDictionary *completion=[event(@"2",@"completed",now+.1) mutableCopy];completion[@"turn"]=@"turn-one";
    assert(![inbox accept:completion]&&[inbox.items.firstObject[@"kind"] isEqual:@"question"]);
    completion[@"id"]=[@"3" stringByPaddingToLength:64 withString:@"3" startingAtIndex:0];completion[@"turn"]=@"turn-two";
    assert([inbox accept:completion]&&[inbox.items.firstObject[@"kind"] isEqual:@"completed"]);
    assert([[CodexAlerts chatURL:approval].absoluteString isEqual:@"codex://threads/synthetic-thread"]);
    NSMutableDictionary *invalid=[approval mutableCopy];invalid[@"thread"]=@"../bad?url";assert(![CodexAlerts validEvent:invalid]);assert(![CodexAlerts chatURL:invalid]);
    invalid=[approval mutableCopy];invalid[@"title"]=@12;assert(![CodexAlerts validEvent:invalid]);
    invalid[@"title"]=@"bad\ncontrol";assert(![CodexAlerts validEvent:invalid]);
    invalid[@"title"]=[@"x" stringByPaddingToLength:241 withString:@"x" startingAtIndex:0];assert(![CodexAlerts validEvent:invalid]);
    assert(![CodexAlerts validEvent:event(@"a",@"completed",now-90000)]);
    assert(![CodexAlerts validEvent:event(@"a",@"completed",now+120)]);
    NSData *bytes=[NSJSONSerialization dataWithJSONObject:event(@"f",@"question",now+.2) options:0 error:NULL];[bytes writeToURL:[root URLByAppendingPathComponent:@"event.json"] atomically:YES];
    assert([inbox poll]&&[inbox.items.firstObject[@"kind"] isEqual:@"question"]);
    assert(![inbox poll]);assert(![NSFileManager.defaultManager fileExistsAtPath:[root URLByAppendingPathComponent:@"event.json"].path]);
    NSURL *directory=[root URLByAppendingPathComponent:@"preserve.json" isDirectory:YES];[NSFileManager.defaultManager createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:NULL];
    [inbox poll];assert([NSFileManager.defaultManager fileExistsAtPath:directory.path]);
    [inbox dismiss:inbox.items.firstObject[@"id"]];assert(inbox.items.count==0);
    NSURL *database=[root URLByAppendingPathComponent:@"receipts.sqlite"];
    sqlite3 *db=NULL;assert(sqlite3_open(database.fileSystemRepresentation,&db)==SQLITE_OK);
    assert(sqlite3_exec(db,"CREATE TABLE thread_read_receipts(thread_id TEXT PRIMARY KEY,first_unread_turn TEXT,last_published_turn TEXT); INSERT INTO thread_read_receipts VALUES('synthetic-thread','turn-two','turn-two');",NULL,NULL,NULL)==SQLITE_OK);
    assert([CodexAlerts acknowledgedEvents:@[completion] database:database].count==0);
    assert(sqlite3_exec(db,"UPDATE thread_read_receipts SET first_unread_turn=NULL;",NULL,NULL,NULL)==SQLITE_OK);
    NSData *beforeReceiptRead=[NSData dataWithContentsOfURL:database];
    assert(([[CodexAlerts acknowledgedEvents:@[completion,waiting] database:database] isEqual:@[completion[@"id"]]]));
    assert([beforeReceiptRead isEqual:[NSData dataWithContentsOfURL:database]]);
    NSMutableDictionary *newer=[completion mutableCopy];newer[@"turn"]=@"turn-three";
    assert([CodexAlerts acknowledgedEvents:@[newer] database:database].count==0);
    [newer removeObjectForKey:@"turn"];assert([CodexAlerts acknowledgedEvents:@[newer] database:database].count==0);
    assert(sqlite3_exec(db,"DROP TABLE thread_read_receipts;",NULL,NULL,NULL)==SQLITE_OK);
    assert([CodexAlerts acknowledgedEvents:@[completion] database:database].count==0);sqlite3_close(db);
    NSURL *missing=[root URLByAppendingPathComponent:@"not-created.sqlite"];
    assert([CodexAlerts acknowledgedEvents:@[completion] database:missing].count==0);
    assert(![NSFileManager.defaultManager fileExistsAtPath:missing.path]);
    puts("PASS: exact-turn read receipt clears completion only; unread, newer, pending and unknown schema survive; database stays unchanged");
    [NSFileManager.defaultManager removeItemAtURL:root error:NULL];
    puts("PASS: Codex alert input bounds, neutral lifecycle types, duplicate/out-of-order events, resolution, safe chat URLs, atomic inbox consumption and dismissal");
}return 0;}
