#import <Cocoa/Cocoa.h>

@interface CodexAlerts : NSObject
@property NSURL *root;
@property NSMutableArray<NSDictionary *> *items;
@property NSMutableSet<NSString *> *seen;
- (instancetype)initWithRoot:(NSURL *)root;
- (BOOL)poll;
- (NSArray<NSDictionary *> *)readEvents;
- (BOOL)accept:(NSDictionary *)event;
- (void)dismiss:(NSString *)identifier;
+ (NSURL *)readStateDatabase;
+ (NSArray<NSString *> *)acknowledgedEvents:(NSArray<NSDictionary *> *)events database:(NSURL *)url;
+ (BOOL)validEvent:(id)event;
+ (NSURL *)chatURL:(NSDictionary *)event;
@end
