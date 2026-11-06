#import "CodexAlerts.h"

@implementation CodexAlerts
- (instancetype)initWithRoot:(NSURL *)root {
    if((self=[super init])){self.root=root;self.items=[NSMutableArray new];self.seen=[NSMutableSet new];}return self;
}
+ (BOOL)validEvent:(id)e {
    if(![e isKindOfClass:NSDictionary.class]||![e[@"version"] isEqual:@1])return NO;
    for(NSString *field in @[@"id",@"thread",@"kind"])if(![e[field] isKindOfClass:NSString.class])return NO;
    if([e[@"id"] length]!=64||[e[@"thread"] length]<1||[e[@"thread"] length]>100)return NO;
    NSCharacterSet *hex=[[NSCharacterSet characterSetWithCharactersInString:@"abcdef0123456789"] invertedSet];
    NSCharacterSet *safe=[[NSCharacterSet characterSetWithCharactersInString:@"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"] invertedSet];
    if([e[@"id"] rangeOfCharacterFromSet:hex].location!=NSNotFound||[e[@"thread"] rangeOfCharacterFromSet:safe].location!=NSNotFound)return NO;
    if(![@[@"completed",@"approval",@"question",@"clear"] containsObject:e[@"kind"]]||![e[@"at"] isKindOfClass:NSNumber.class])return NO;
    for(NSString *field in @[@"turn",@"title"]){
        id value=e[field];if(!value)continue;
        if(![value isKindOfClass:NSString.class]||[value length]>([field isEqual:@"title"]?240:100)||[value rangeOfCharacterFromSet:NSCharacterSet.controlCharacterSet].location!=NSNotFound)return NO;
    }
    double at=[e[@"at"] doubleValue],now=NSDate.date.timeIntervalSince1970;
    return isfinite(at)&&at>now-86400&&at<now+60;
}
+ (NSURL *)chatURL:(NSDictionary *)event {
    if(![self validEvent:event])return nil;
    return [NSURL URLWithString:[@"codex://threads/" stringByAppendingString:event[@"thread"]]];
}
- (BOOL)accept:(NSDictionary *)event {
    if(![CodexAlerts validEvent:event]||[self.seen containsObject:event[@"id"]])return NO;
    [self.seen addObject:event[@"id"]];if(self.seen.count>1000){[self.seen removeAllObjects];[self.seen addObject:event[@"id"]];}
    NSString *thread=event[@"thread"],*kind=event[@"kind"];
    NSDictionary *current=nil;for(NSDictionary *item in self.items)if([item[@"thread"] isEqual:thread]){current=item;break;}
    if(current&&[current[@"at"] doubleValue]>[event[@"at"] doubleValue])return NO;
    if([kind isEqual:@"clear"]){if(!current)return NO;[self.items removeObject:current];return YES;}
    BOOL sameTurn=current&&current[@"turn"]&&[current[@"turn"] isEqual:event[@"turn"]];
    if(sameTurn&&[kind isEqual:@"completed"]&&![current[@"kind"] isEqual:@"completed"])return NO;
    if(current)[self.items removeObject:current];
    NSMutableDictionary *item=[@{@"version":@1,@"id":event[@"id"],@"thread":event[@"thread"],@"kind":event[@"kind"],@"at":event[@"at"]} mutableCopy];
    for(NSString *field in @[@"title",@"turn"])if(event[field])item[field]=event[field];
    [self.items insertObject:item atIndex:0];if(self.items.count>30)[self.items removeLastObject];return YES;
}
- (void)dismiss:(NSString *)identifier {
    NSIndexSet *set=[self.items indexesOfObjectsPassingTest:^BOOL(NSDictionary *item,NSUInteger index,BOOL *stop){(void)index;(void)stop;return [item[@"id"] isEqual:identifier];}];[self.items removeObjectsAtIndexes:set];
}
- (BOOL)poll {
    BOOL changed=NO;for(NSDictionary *event in [self readEvents])changed=[self accept:event]||changed;return changed;
}
- (NSArray<NSDictionary *> *)readEvents {
    NSNumber *symbolic=nil;[self.root getResourceValue:&symbolic forKey:NSURLIsSymbolicLinkKey error:NULL];if(symbolic.boolValue)return @[];
    NSArray *files=[NSFileManager.defaultManager contentsOfDirectoryAtURL:self.root includingPropertiesForKeys:@[NSURLFileSizeKey,NSURLIsSymbolicLinkKey,NSURLIsRegularFileKey] options:NSDirectoryEnumerationSkipsHiddenFiles error:NULL];
    NSMutableArray *events=[NSMutableArray new];NSUInteger scanned=0;
    for(NSURL *file in files){
        if(![file.pathExtension isEqual:@"json"]||scanned++>=256)continue;
        NSNumber *size=nil,*link=nil,*regular=nil;[file getResourceValue:&size forKey:NSURLFileSizeKey error:NULL];[file getResourceValue:&link forKey:NSURLIsSymbolicLinkKey error:NULL];[file getResourceValue:&regular forKey:NSURLIsRegularFileKey error:NULL];
        if(link.boolValue||!regular.boolValue)continue;
        if(size.unsignedLongLongValue<=4096){NSData *data=[NSData dataWithContentsOfURL:file];id event=data?[NSJSONSerialization JSONObjectWithData:data options:0 error:NULL]:nil;if([CodexAlerts validEvent:event])[events addObject:event];}
        [NSFileManager.defaultManager removeItemAtURL:file error:NULL];
    }
    [events sortUsingComparator:^NSComparisonResult(NSDictionary *a,NSDictionary *b){return [a[@"at"] compare:b[@"at"]];}];return events;
}
@end
