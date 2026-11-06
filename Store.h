#import <Foundation/Foundation.h>

@interface MoodStore : NSObject
@property NSURL *root;
@property NSDictionary *state;
@property BOOL readOnly;
@property NSString *warning;
@property NSData *loadedBytes;
- (instancetype)initWithRoot:(NSURL *)root;
- (NSDictionary *)load;
- (BOOL)save:(NSDictionary *)state error:(NSError **)error;
- (NSDictionary *)importImage:(NSURL *)url error:(NSError **)error;
- (NSString *)skinSource;
+ (BOOL)validState:(id)value;
@end
BOOL RunStorageTests(void);
BOOL WriteSyntheticGIF(NSURL *url);
